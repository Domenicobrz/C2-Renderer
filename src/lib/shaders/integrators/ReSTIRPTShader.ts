import type { LUTManager } from '$lib/managers/lutManager';
import { resampleLogic } from './resampleLogic';
import { getReSTIRPTSharedPart } from './sharedPart';

export function getReSTIRPTShader(lutManager: LUTManager) {
  return /* wgsl */ `

  ${getReSTIRPTSharedPart(lutManager)}

// @group(0) @binding(0) var<storage, read_write> radianceOutput: array<vec3f>;
@group(0) @binding(0) var<storage, read_write> restirPassOutput: array<Reservoir>;
@group(0) @binding(1) var<storage, read_write> samplesCount: array<u32>;
@group(0) @binding(2) var<uniform> canvasSize: vec2u;

// on a separate bind group since camera changes more often than data/canvasSize
@group(1) @binding(0) var<uniform> camera: Camera;
// seems like maximum bindgroup count is 4 so I need to add the camera sample here 
// unfortunately and I can't create a separate bindgroup for it
@group(1) @binding(1) var<uniform> haltonSamples: array<vec4f, RANDOMS_VEC4F_ARRAY_COUNT>;
@group(1) @binding(2) var<uniform> haltonSamples2: array<vec4f, RANDOMS_VEC4F_ARRAY_COUNT>;
@group(1) @binding(3) var<uniform> uniformRandom: array<vec4f, RANDOMS_VEC4F_ARRAY_COUNT>;
@group(1) @binding(4) var<uniform> config: Config;
@group(1) @binding(5) var<uniform> finalPass: u32; // UNUSED: USED ONLY IN SR PASS

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

const MAX_SR_CANDIDATES_COUNT = 2;
const temporalResample = true;

${resampleLogic}

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
  debugInfo.sample = samplesCount[idx];

  var prevReservoir = restirPassOutput[idx];
  var reservoir = Reservoir(
    PathInfo(vec3f(0.0), vec2i(tid.xy), 0, 0, 0, -1, vec2f(0), vec3f(0), vec3f(0), vec2f(0), vec2i(-1)),
    vec2i(tid.xy), vec4f(0,0,0,-1), 0.0, 0.0, 0.0, 1.0,
  );

  initializeRandoms(tid, debugInfo.sample);
  initializeRandoms2(tid);

  // setting any other number other than 1 will thwart the random replay since the selected
  // candidate will have a seed that wont reflect the random numbers that have been selected
  let INITIAL_CANDIDATES_COUNT = 1;

  for (var ic = 0; ic < INITIAL_CANDIDATES_COUNT; ic++) {
    var rayContribution: f32;
    var ray = getCameraRay(tid, idx, &rayContribution);
  
    var pathSampleInfo = PathSampleInfo(
      false, vec3f(0.0), vec3f(0.0), 0, 0, -1, vec3f(1.0), -1
    );
    var pi = PathInfo(vec3f(0.0), vec2i(tid.xy), 0, 0, 0, 0, vec2f(0), vec3f(0), vec3f(0), vec2f(0), vec2i(-1));
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
      } 
      // else if (shaderConfig.HAS_ENVMAP) {
      //   // we bounced off into the envmap
      //   let envmapRad = getEnvmapRadiance(ray.direction);
      //   rad += reflectance * envmapRad;
      //   break;
      // }
  
      // if (reflectance.x == 0.0 && reflectance.y == 0.0 && reflectance.z == 0.0) {
      //   break;
      // }
    }
  }

  // I think it would be better to multiply every wi
  // instead of doing this to avoid me forgetting this thing
  // when I'll eventually implement temporal reuse
  reservoir.wSum /= f32(INITIAL_CANDIDATES_COUNT);
  reservoir.c = 1.0;

  if (reservoir.isNull <= 0.0) {
    reservoir.Wy = (1 / length(reservoir.Y.F)) * reservoir.wSum;
  }


  // temporal resample if there's temporal data to reuse
  if (prevReservoir.isNull <= 0.0) {
    var candidates = array<Reservoir, 2>();
    candidates[0] = reservoir;

    // in theory, I should compare the normals / depth etc. since
    // I could be picking candidates from edges etc.
    candidates[1] = prevReservoir;  

    reservoir = SpatialResample(candidates, tid);
  }



  // if (debugInfo.isSelectedPixel) {
  //   radianceOutput[idx] += vec3f(100, 0, 100);
  // } else {
  //   radianceOutput[idx] += rad * rayContribution;
  // }

  restirPassOutput[idx] = reservoir;
  samplesCount[idx] += 1;
}
`;
}
