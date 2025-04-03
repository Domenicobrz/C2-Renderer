import type { LUTManager } from '$lib/managers/lutManager';
import { resampleLogic } from './resampleLogic';
import { getReSTIRPTSharedPart } from './sharedPart';

export function getReSTIRPTShader2(lutManager: LUTManager) {
  return /* wgsl */ `

  ${getReSTIRPTSharedPart(lutManager)}

@group(0) @binding(0) var<storage, read_write> restirPassInput: array<Reservoir>;
@group(0) @binding(1) var<storage, read_write> restirPassOutput: array<Reservoir>;
@group(0) @binding(2) var<uniform> canvasSize: vec2u;

// on a separate bind group since camera changes more often than data/canvasSize
@group(1) @binding(0) var<uniform> camera: Camera;
// seems like maximum bindgroup count is 4 so I need to add the camera sample here 
// unfortunately and I can't create a separate bindgroup for it
@group(1) @binding(1) var<uniform> haltonSamples: array<vec4f, RANDOMS_VEC4F_ARRAY_COUNT>;
@group(1) @binding(2) var<uniform> haltonSamples2: array<vec4f, RANDOMS_VEC4F_ARRAY_COUNT>;
@group(1) @binding(3) var<uniform> uniformRandom: array<vec4f, RANDOMS_VEC4F_ARRAY_COUNT>;
@group(1) @binding(4) var<uniform> config: Config;
@group(1) @binding(5) var<uniform> finalPass: u32;
@group(1) @binding(6) var<uniform> passIdx: u32; 
@group(1) @binding(7) var<uniform> sampleIdx: u32; 

@group(2) @binding(0) var<storage, read_write> debugBuffer: array<f32>;
@group(2) @binding(1) var<uniform> debugPixelTarget: vec2<u32>;

@group(3) @binding(0) var<storage> triangles: array<Triangle>;
@group(3) @binding(1) var<storage> materialsData: array<f32>;
@group(3) @binding(2) var<storage> bvhData: array<BVHNode>;
@group(3) @binding(3) var<storage> lightsCDFData: array<LightCDFEntry>;
// envmapPC2Darray will contain:
// pConditionalV: PC1D[];
// pMarginal: PC1D;
// - - - - - - - -  
// PC1D will be held in memory with this layout:
// min, max, funcInt, func[], absFunc[], cdf[]
@group(3) @binding(4) var<storage> envmapPC2Darray: array<f32>;
@group(3) @binding(5) var<uniform> envmapPC2D: PC2D;
@group(3) @binding(6) var envmapTexture: texture_2d<f32>;
@group(3) @binding(7) var<uniform> envmapInfo: EnvmapInfo;
@group(3) @binding(8) var textures128: texture_2d_array<f32>;
@group(3) @binding(9) var textures512: texture_2d_array<f32>;
@group(3) @binding(10) var textures1024: texture_2d_array<f32>;
// learn opengl uses 128x128 on their own implementation for DGF
// adobe photoshop can export and use LUTs of 32 and 64
// I decided to use up to two slots: lut32 and lut64
// for LUTs that are single-layer and higher than 64, we can use the texture_2d_arrays above
@group(3) @binding(11) var lut32: texture_3d<f32>;
@group(3) @binding(12) var blueNoise256: texture_2d<f32>;

// ***** Things to remember:  (https://webgpureport.org/)
// maxStorageBuffersPerShaderStage = 8
// maxUniformBuffersPerShaderStage = 12 (maxUniformBuffersPerShaderStage)
// maxBindingsPerBindGroup = 1000
// maxSampledTexturesPerShaderStage = 16
// maxTextureDimension3D = 2048

const MAX_SR_CANDIDATES_COUNT = 6;
var<private> temporalResample = false;

${resampleLogic}

fn initialCandidatesReservoir(tid: vec3u, domain: vec3u, idx: u32) -> Reservoir {
  var reservoir = Reservoir(
                        // seed will be set inside the loop
    PathInfo(vec3f(0.0), 0, 0, 0, 0, 0, -1, vec2f(0), vec3f(0), vec3f(0), vec2f(0), vec2i(-1)),
    vec3i(domain), vec4f(0,0,0,-1), 0.0, 0.0, 0.0, 1.0, vec3f(0.0),
  );

  initializeRandoms2(tid);

  for (var ic = 0; ic < config.RESTIR_INITIAL_CANDIDATES; ic++) {
    // if Path info will be accepted, it will also take this seed and save it in the reservoir
    let seed = hashPixelAndSeed(tid.xy, u32(haltonSamples[ic].x * f32(1099087573)));
    let firstVertexSeed = seed;

    initializeRandoms(seed);
    
    var rayContribution: f32;
    var ray = getCameraRay(tid, idx, &rayContribution);
  
    var pathSampleInfo = PathSampleInfo(
      false, vec3f(0.0), vec3f(0.0), 0, 0, -1, vec3f(1.0), -1
    );
    var pi = PathInfo(vec3f(0.0), firstVertexSeed, seed, 0, 0, 0, 0, vec2f(0), vec3f(0), vec3f(0), vec2f(0), vec2i(-1));
    var throughput = vec3f(1.0);
    var rad = vec3f(0.0);
    var lastBrdfMis = 1.0;
    for (var i = 0; i < config.BOUNCES_COUNT; i++) {
      if (rayContribution == 0.0) { break; }
  
      debugInfo.bounce = i;
  
      let ires = bvhIntersect(ray);
      
      if (ires.hit) {
        shade(
          ires, &ray, &reservoir, &throughput, &pi, &pathSampleInfo, 
          &lastBrdfMis, false, tid, i
        );
      } else if (shaderConfig.HAS_ENVMAP) {
        // we bounced off into the envmap
        let envmapRad = getEnvmapRadiance(ray.direction);
        envmapPathConstruction(
          &reservoir, &throughput, &pi, &pathSampleInfo, &lastBrdfMis, envmapRad,
        );
        break;
      }
  
      // if (reflectance.x == 0.0 && reflectance.y == 0.0 && reflectance.z == 0.0) {
      //   break;
      // }
    }
  }

  // I think it would be better to multiply every wi
  // instead of doing this to avoid me forgetting this thing
  // when I'll eventually implement temporal reuse
  reservoir.wSum /= f32(config.RESTIR_INITIAL_CANDIDATES);
  reservoir.c = 1.0;

  if (reservoir.isNull <= 0.0) {
    reservoir.Wy = (1 / length(reservoir.Y.F)) * reservoir.wSum;
  }

  return reservoir;
}

fn getSpatialResampleCandidates(tid: vec3u, idx: u32) -> array<Reservoir, MAX_SR_CANDIDATES_COUNT> {
  initializeRandoms2(tid);

  var rad = vec3f(0.0);
  var reservoir: Reservoir;

  // ******* important: first candidate is current pixel's reservoir ***********
  var candidates = array<Reservoir, MAX_SR_CANDIDATES_COUNT>();
  var normal0 = vec3f(0.0);
  var depth0 = 0.0;
  var currConfidence = 0.0;
  for (var i = 0; i < config.RESTIR_SR_CANDIDATES; i++) {
    if (i == 0) {
      candidates[0] = restirPassInput[idx];
      currConfidence = candidates[0].c;
      normal0 = candidates[i].Gbuffer.xyz;
      depth0 = candidates[i].Gbuffer.w;
    } else {
      // uniform circle sampling
      // TODO: the paper recommends using a low discrepancy sequence here
      let circleRadiusInPixels = 10.0;   // the paper recommends 10.0
      let rands = getRand2D_2();
      let r = circleRadiusInPixels * sqrt(rands.x);
      let theta = rands.y * 2.0 * PI;

      let offx = i32(r * cos(theta));
      let offy = i32(r * sin(theta));

      let ntid = vec3i(i32(tid.x) + offx, i32(tid.y) + offy, 0);
      if (ntid.x >= 0 && ntid.y >= 0 && ntid.x < i32(canvasSize.x) && ntid.y < i32(canvasSize.y)) {
        let nidx = ntid.y * i32(canvasSize.x) + ntid.x;
        candidates[i] = restirPassInput[nidx];

        // GBuffer test
        let normal1 = candidates[i].Gbuffer.xyz;
        let depth1 = candidates[i].Gbuffer.w;

        if (dot(normal1, normal0) < 0.9) {
          candidates[i] = Reservoir(
            PathInfo(vec3f(0.0), 0, 0, 0, 0, 0, -1, vec2f(0), vec3f(0), vec3f(0), vec2f(0), vec2i(-1)),
            vec3i(-1, -1, -1), vec4f(0,0,0,-1), 0.0, currConfidence, 0.0, 1.0, vec3f(0.0),
          );
        }
      } else {
        candidates[i] = Reservoir(
          PathInfo(vec3f(0.0), 0, 0, 0, 0, 0, -1, vec2f(0), vec3f(0), vec3f(0), vec2f(0), vec2i(-1)),
          vec3i(-1, -1, -1), vec4f(0,0,0,-1), 0.0, currConfidence, 0.0, 1.0, vec3f(0.0),
        );
      }
    }
  }

  return candidates;
}

@compute @workgroup_size(8, 8) fn compute(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let tid = vec3u(gid.x, gid.y, 0);
  if (tid.x >= canvasSize.x || tid.y >= canvasSize.y) { return; }

  let idx = tid.y * canvasSize.x + tid.x;

  debugInfo.tid = tid;
  debugInfo.isSelectedPixel = false;
  if (debugPixelTarget.x == tid.x && debugPixelTarget.y == tid.y) {
    debugInfo.isSelectedPixel = true;
  }

  temporalResample = (passIdx == 0 && config.USE_TEMPORAL_RESAMPLE > 0);

  let domain = vec3u(tid.xy, 0);

  let emptyReservoir = Reservoir(
    PathInfo(vec3f(0.0), 0, 0, 0, 0, 0, -1, vec2f(0), vec3f(0), vec3f(0), vec2f(0), vec2i(-1)),
    vec3i(domain), vec4f(0,0,0,-1), 0.0, 0.0, 0.0, 1.0, vec3f(0.0),
  );

  var prevReservoir = restirPassInput[idx];
  if (sampleIdx == 0) {
    prevReservoir = emptyReservoir;
  }
  var outputReservoir = emptyReservoir;
  var icReservoir = emptyReservoir;

  if (passIdx == 0) {
    icReservoir = initialCandidatesReservoir(tid, domain, idx);
    outputReservoir = icReservoir;
  }

  var candidates = array<Reservoir, MAX_SR_CANDIDATES_COUNT>();

  let isTemporalPass = (passIdx == 0) && (config.USE_TEMPORAL_RESAMPLE > 0); 
  let isSpatialPass = (passIdx > 0);

  if (passIdx == 0) {
    debugLog(select(0.0, 1.0, isTemporalPass));
    debugLog(select(0.0, 1.0, temporalResample));
    debugLog(f32(sampleIdx));
    debugLog(2222.0);
  }

  if (isTemporalPass) {
    candidates[0] = icReservoir;
    candidates[1] = prevReservoir;
    // there has to be a better way to do this v v v
    candidates[2] = emptyReservoir;
    candidates[3] = emptyReservoir;
    candidates[4] = emptyReservoir;
    candidates[5] = emptyReservoir;
  }
  if (isSpatialPass) {
    candidates = getSpatialResampleCandidates(tid, idx);
  }

  if (isTemporalPass || isSpatialPass) {
    outputReservoir = SpatialResample(candidates, domain);
  }

  if (!isSpatialPass) {
    restirPassInput[idx] = outputReservoir;
  } else {
    var rad = vec3f(0.0);

    // simplified version to debug SR 
    // var outputReservoir = restirPassInput[idx];
    // if you enable ^ also comment the spatial-resample part
    if (outputReservoir.isNull < 0.0) {
      // theoretically we shouldn't re-use Y.F but for now we'll do it
      rad = outputReservoir.Y.F * outputReservoir.Wy;
    }

    restirPassOutput[idx] = outputReservoir;
  
    if (finalPass == 1) {
      if (debugInfo.isSelectedPixel) {
        restirPassOutput[idx].rad += vec3f(1, 0, 0);
      } else {
        restirPassOutput[idx].rad += rad;
      }
    }
  }
}
`;
}
