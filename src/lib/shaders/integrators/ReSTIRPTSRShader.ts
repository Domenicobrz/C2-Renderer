import type { LUTManager } from '$lib/managers/lutManager';
import { resampleLogic } from './resampleLogic';
import { getReSTIRPTSharedPart } from './sharedPart';

export function getReSTIRPTSRShader(lutManager: LUTManager) {
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
@group(1) @binding(5) var<uniform> finalPass: u32; // 1 if true, 0 otherwise

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

const MAX_SR_CANDIDATES_COUNT = 10;
const temporalResample = false;

${resampleLogic}

@compute @workgroup_size(8, 8) fn compute(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  // **************** WARNING *****************
  // **************** WARNING *****************
  // **************** WARNING *****************
  // without being able to use return; here, since we need uniformity
  // to use a storageBarrier(), we have to make sure that our tiles
  // do not exceed the boundaries too much otherwise there can potentially
  // be a gigantic amount of computation that is wasteful and that needs to
  // happen regardless since lines are executed in lockstep
  var isOutOfScreenBounds = false;
  let tid = vec3u(gid.x, gid.y, 0);

  if (tid.x >= canvasSize.x || tid.y >= canvasSize.y) {
    isOutOfScreenBounds = true;
  }

  let idx = tid.y * canvasSize.x + tid.x;

  debugInfo.tid = tid;
  debugInfo.isSelectedPixel = false;
  if (debugPixelTarget.x == tid.x && debugPixelTarget.y == tid.y) {
    debugInfo.isSelectedPixel = true;
  }

  initializeRandoms2(tid);

  var rad = vec3f(0.0);
  var reservoir: Reservoir;

  if (!isOutOfScreenBounds) {
    // var reservoir = restirPassInput[idx];
    // if (reservoir.isNull < 0.0) {
    //   // pHat(Y) * Wy
    //   rad = reservoir.Y.F * reservoir.Wy;
    // }

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
        let circleRadiusInPixels = 10.0;
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

    // canonical candidate's domain
    let domain = candidates[0].domain;
    reservoir = SpatialResample(candidates, vec3u(domain));
    if (reservoir.isNull < 0.0) {
      // theoretically we shouldn't re-use Y.F but for now we'll do it
      rad = reservoir.Y.F * reservoir.Wy;
    }
  }

  // // https://www.w3.org/TR/WGSL/#storageBarrier-builtin
  // // https://stackoverflow.com/questions/72035548/what-does-storagebarrier-in-webgpu-actually-do
  // // "storageBarrier coordinates access by invocations in single workgroup
  // // to buffers in 'storage' address space."
  // storageBarrier();

  // every thread needs to be able to reach the storageBarrier for us to be able to use it,
  // so early returns can only happen afterwards
  if (isOutOfScreenBounds) {
    return;
  }

  restirPassOutput[idx] = reservoir;

  if (finalPass == 1) {
    if (debugInfo.isSelectedPixel) {
      restirPassOutput[idx].rad += vec3f(1, 0, 0);
    } else {
      restirPassOutput[idx].rad += rad;
    }
  }
}
`;
}
