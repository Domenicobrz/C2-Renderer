import type { ReSTIRConfigManager } from '$lib/config';
import type { LUTManager } from '$lib/managers/lutManager';
import { getReSTIRPTSharedPart } from './sharedPart';

export function getReSTIRPTShader2(lutManager: LUTManager, configManager: ReSTIRConfigManager) {
  return /* wgsl */ `

  ${getReSTIRPTSharedPart(lutManager, configManager)}

@group(0) @binding(0) var<storage, read_write> restirPassInput: array<Reservoir>;
@group(0) @binding(1) var<storage, read_write> restirPassOutput: array<Reservoir>;
@group(0) @binding(2) var<uniform> canvasSize: vec2u;

// on a separate bind group since camera changes more often than data/canvasSize
@group(1) @binding(0) var<uniform> camera: Camera;
// seems like maximum bindgroup count is 4 so I need to add the camera sample here 
// unfortunately and I can't create a separate bindgroup for it
@group(1) @binding(1) var<uniform> randomSeed: f32;
@group(1) @binding(2) var<uniform> uniformRandom: array<vec4f, RANDOMS_VEC4F_ARRAY_COUNT>;
@group(1) @binding(3) var<uniform> config: Config;
struct PassInfo {
  finalPass: u32,
  icPassIdx: u32, // pass index for initial candidates
  passIdx: u32,   // 0 == ic pass, 1+ sr passes
  sampleIdx: u32,
}
@group(1) @binding(4) var<uniform> passInfo: PassInfo;
@group(1) @binding(5) var<uniform> tile: Tile;

@group(2) @binding(0) var<storage, read_write> debugBuffer: array<f32>;
@group(2) @binding(1) var<uniform> debugPixelTarget: vec2<u32>;

@group(3) @binding(0) var<storage> triangles: array<Triangle>;
@group(3) @binding(1) var<storage> materialsBuffer: array<f32>;
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

fn initialCandidatesReservoir(tid: vec3u, domain: vec2u, idx: u32) -> Reservoir {
  var reservoir = Reservoir(
                        // seed will be set inside the loop
    PathInfo(vec3f(0.0), 0, 0, 0, 0, 0, vec2f(0), vec2f(0), vec3f(0), vec3f(0), -1),
    vec4f(0,0,0,-1), 0.0, 0.0, 0.0, 1.0, vec3f(0.0), packDomain(vec2i(domain))
  );

  initializeRandoms2(tid);

  let ic = passInfo.icPassIdx;

  // if Path info will be accepted, it will also take this seed and save it in the reservoir
  let seed = hashPixelAndSeed(tid.xy, u32(randomSeed * f32(1099087573)));
  let firstVertexSeed = seed;

  initializeRandoms(seed);
  
  var rayContribution: f32;
  var ray = getCameraRay(tid, idx, &rayContribution);

  var pathSampleInfo = PathSampleInfo(
    false, vec3f(0.0), vec3f(0.0), 0, 0, -1, vec3f(1.0), -1
  );
  var pi = PathInfo(vec3f(0.0), firstVertexSeed, seed, 0, 0, 0, vec2f(0), vec2f(0), vec3f(0), vec3f(0), 0);
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

    if (throughput.x == 0.0 && throughput.y == 0.0 && throughput.z == 0.0) {
      break;
    }
  }

  // if (reservoir.isNull <= 0.0) {
  //   reservoir.Wy = (1 / length(reservoir.Y.F)) * reservoir.wSum;
  // }

  return reservoir;
}

fn combineReservoirs(newCandidate: Reservoir, idx: u32) -> Reservoir {
  let isFirstICPass = passInfo.icPassIdx == 0;
  let isLastICPass = passInfo.icPassIdx == u32(config.RESTIR_INITIAL_CANDIDATES - 1);

  var ncr = newCandidate;
  ncr.wSum /= f32(config.RESTIR_INITIAL_CANDIDATES);

  var reservoir = restirPassOutput[idx];
  if (isFirstICPass) {
    reservoir = ncr;
  } else {
    updateReservoir(&reservoir, ncr.Y, ncr.wSum);
  }

  if (isLastICPass) {
    reservoir.c = 1.0;
    if (reservoir.isNull <= 0.0) {
      reservoir.Wy = (1 / length(reservoir.Y.F)) * reservoir.wSum;
    }
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
      let circleRadiusInPixels = config.SR_CIRCLE_RADIUS;   // the paper recommends 10.0
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
            PathInfo(vec3f(0.0), 0, 0, 0, 0, 0, vec2f(0), vec2f(0), vec3f(0), vec3f(0), -1),
            vec4f(0,0,0,-1), 0.0, currConfidence, 0.0, 1.0, vec3f(0.0), packDomain(vec2i(-1, -1))
          );
        }
      } else {
        candidates[i] = Reservoir(
          PathInfo(vec3f(0.0), 0, 0, 0, 0, 0, vec2f(0), vec2f(0), vec3f(0), vec3f(0), -1),
          vec4f(0,0,0,-1), 0.0, currConfidence, 0.0, 1.0, vec3f(0.0), packDomain(vec2i(-1, -1))
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
  // let tid = vec3u(gid.x, gid.y, 0);
  let tid = vec3u(tile.x + gid.x, tile.y + gid.y, 0);
  if (tid.x >= canvasSize.x || tid.y >= canvasSize.y) { return; }

  let idx = tid.y * canvasSize.x + tid.x;

  debugInfo.tid = tid;
  debugInfo.isSelectedPixel = false;
  if (debugPixelTarget.x == tid.x && debugPixelTarget.y == tid.y) {
    debugInfo.isSelectedPixel = true;
  }

  temporalResample = (passInfo.passIdx == 0 && config.USE_TEMPORAL_RESAMPLE > 0);

  let domain = vec2u(tid.xy);

  let emptyReservoir = Reservoir(
    PathInfo(vec3f(0.0), 0, 0, 0, 0, 0, vec2f(0), vec2f(0), vec3f(0), vec3f(0), -1),
    vec4f(0,0,0,-1), 0.0, 0.0, 0.0, 1.0, vec3f(0.0), packDomain(vec2i(domain))
  );

  var prevReservoir = restirPassInput[idx];
  if (passInfo.sampleIdx == 0) {
    prevReservoir = emptyReservoir;
  }
  var outputReservoir = emptyReservoir;
  var icReservoir = emptyReservoir;

  if (passInfo.passIdx == 0) {
    icReservoir = initialCandidatesReservoir(tid, domain, idx);
    outputReservoir = combineReservoirs(icReservoir, idx);
  }

  var candidates = array<Reservoir, MAX_SR_CANDIDATES_COUNT>();

  let isLastICPass = passInfo.icPassIdx == u32(config.RESTIR_INITIAL_CANDIDATES - 1);
  let isTemporalPass = (passInfo.passIdx == 0) && 
                       (config.USE_TEMPORAL_RESAMPLE > 0) && 
                       (passInfo.icPassIdx == u32(config.RESTIR_INITIAL_CANDIDATES - 1)); 
  let isSpatialPass = (passInfo.passIdx > 0);

  if (isTemporalPass) {
    candidates[0] = outputReservoir;
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
    outputReservoir = Resample(candidates, domain);
  }

  if (!isSpatialPass) {
    // the reason why we're using both restirPassInput
    // and restirPassOutput is due to having to save
    // two different types of state:
    // the temporally accumulated reservoir,
    // and the initial-candidates reservoir that is 
    // created over multiple render calls
    if (isLastICPass) {
      restirPassInput[idx] = outputReservoir;
    } else {
      restirPassOutput[idx] = outputReservoir;
    }
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
  
    if (passInfo.finalPass == 1) {
      if (debugInfo.isSelectedPixel) {
        restirPassOutput[idx].rad += vec3f(1, 0, 0);
      } else {
        restirPassOutput[idx].rad += rad;
      }
    }
  }



 
  // // test for compute only
  // if (!isSpatialPass) {
  //   // the reason why we're using both restirPassInput
  //   // and restirPassOutput is due to having to save
  //   // two different types of state:
  //   // the temporally accumulated reservoir,
  //   // and the initial-candidates reservoir that is 
  //   // created over multiple render calls
  //   if (isLastICPass) {
  //     restirPassInput[idx] = outputReservoir;
  //   } else {
  //     restirPassOutput[idx] = outputReservoir;
  //   }
  // } else {
  //   restirPassOutput[idx] = restirPassInput[idx];
    
  //   if (passInfo.finalPass == 1) {
  //     var rad = vec3f(0.0);
  //     if (restirPassInput[idx].isNull < 0.0) {
  //       rad = restirPassInput[idx].Y.F * restirPassInput[idx].Wy;
  //     }
    
  //     if (debugInfo.isSelectedPixel) {
  //       restirPassOutput[idx].rad += vec3f(1, 0, 0);
  //     } else {
  //       restirPassOutput[idx].rad += rad;
  //     }
  //   }
  // }
}
`;
}
