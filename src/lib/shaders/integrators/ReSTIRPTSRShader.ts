import type { LUTManager } from '$lib/managers/lutManager';
import { getReSTIRPTSharedPart } from './sharedPart';

export function getReSTIRPTSRShader(lutManager: LUTManager) {
  return /* wgsl */ `

  ${getReSTIRPTSharedPart(lutManager)}

@group(0) @binding(0) var<storage, read_write> restirPassInput: array<Reservoir>;
@group(0) @binding(1) var<storage, read_write> radianceOutput: array<vec3f>;
@group(0) @binding(2) var<uniform> canvasSize: vec2u;

// on a separate bind group since camera changes more often than data/canvasSize
@group(1) @binding(0) var<uniform> camera: Camera;
// seems like maximum bindgroup count is 4 so I need to add the camera sample here 
// unfortunately and I can't create a separate bindgroup for it
@group(1) @binding(1) var<uniform> haltonSamples: array<vec4f, RANDOMS_VEC4F_ARRAY_COUNT>;
@group(1) @binding(2) var<uniform> uniformRandom: array<vec4f, RANDOMS_VEC4F_ARRAY_COUNT>;
@group(1) @binding(3) var<uniform> config: Config;
@group(1) @binding(4) var<uniform> finalPass: u32; // 1 if true, 0 otherwise

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

const SR_CANDIDATES_COUNT = 3;

fn randomReplay(pi: PathInfo, tid: vec3u) -> RandomReplayResult {
  let idx = tid.y * canvasSize.x + tid.x;

  // initializeRandoms(vec3u(vec2u(pi.seed), 0), 0);

  // the initial camera ray should be the same of the pixel we are shading,
  // to make sure we'll always hit the same surface point x1, and avoid
  // running the risk of one of the random replays to get a camera ray that lands
  // on an x1 with an invalid gbuffer
  initializeRandoms(tid, 0);
  var rayContribution: f32;
  var ray = getCameraRay(tid, idx, &rayContribution);

  // then we'll use the path-info seed number, and also have to remember to
  // skip the camera randoms
  // read segments/integrators/doc1.png to understand why this is necessary
  initializeRandoms(vec3u(vec2u(pi.seed), 0), 0);
  getRand2D(); getRand2D();
  if (camera.catsEyeBokehEnabled > 0) {
    // *********** ERROR ************
    // *********** ERROR ************
    // *********** ERROR ************
    // This wasn't implemented since the catseyedbokeh routine asks for 
    // rand 2ds in a for loop and then uses those rands to decide where to 
    // continue the for loop or not
    return RandomReplayResult(0, vec3f(0), true, vec2f(0.0));
  }

  var lastBrdfMis = 1.0;
  var throughput = vec3f(1.0);
  var rad = vec3f(0.0);
  var unusedReservoir = Reservoir();
  var pathSampleInfo = PathSampleInfo(false, vec3f(0.0), vec3f(0.0), 0, 0, -1, vec3f(1.0), -1);
  var pathInfoCopy = pi;
  for (var i = 0; i < config.BOUNCES_COUNT; i++) {
    if (rayContribution == 0.0) { break; }

    debugInfo.bounce = i;

    let ires = bvhIntersect(ray);

    if (ires.hit) {
      let rrStepResult = shade(ires, &ray, &unusedReservoir, &throughput, &pathInfoCopy, &pathSampleInfo, &lastBrdfMis, true, tid, i);

      if (rrStepResult.shouldTerminate) {
        return rrStepResult;
      }
    } 
    // ..... missing stuff .....
  }

  return RandomReplayResult(0, vec3f(0), true, vec2f(0.0));
}

fn generalizedBalanceHeuristic(
  X: PathInfo, Y: PathInfo, idx: i32, candidates: array<Reservoir, SR_CANDIDATES_COUNT>
) -> f32 {
  let J = (Y.jacobian.x / X.jacobian.x) * abs(Y.jacobian.y / X.jacobian.y);
  // in this case I'm dividing by the jacobian because it was computed when going from x->y,
  // and here we want to basically "transform back" y->x, and doing that would result in the inverse
  // of the jacobian that we got from x->y
  let numerator = length(X.F) / J;
  var denominator = length(X.F) / J;

  for (var i = 0; i < SR_CANDIDATES_COUNT; i++) {
    if (i == idx) { continue; }

    let XjCandidate = candidates[i];

    // there's a big difference between a null candidate path, and a null candidate
    // if one of the ""candidates"" is outside of the screen boundaries, we're not simply
    // stating that the reservoir is null. It's just totally unuseable, there can't be any path
    // associated with a pixel outside the screen boundaries. Nothing at all, none.
    // However, some nearby pixels might have been unable to find a candidate path Y, but *must* still
    // be tested in the generalized balance heuristic. They may have failed to generate a candidate
    // path, but they may be able to successfully random replay the path we're testing here with Y
    // Thus they must be considered and used here otherwise we'll gain energy where we shouldn't.
    // This is the reason why we're only checking if the candidate has a negative seed, that means
    // that the ""candidate"" is one of those samples that fell outside the screen boundaries and is thus 
    // unuseable. This would have been easier if we had access to a dynamic array but sadly we can't
    // same applies for candidates that have been removed because of Gbuffer differences

    // if (Xj.isNull > 0) { continue; }
    if (XjCandidate.domain.x < 0) { continue; }

    // shift Y into Xj's pixel
    let randomReplayResult = randomReplay(Y, vec3u(vec2u(XjCandidate.domain), 0));
    if (randomReplayResult.valid > 0) {
      // shift Y -> Xj and evaluate jacobian
      var Xj = Y;
      Xj.F = randomReplayResult.pHat;
      Xj.jacobian = randomReplayResult.jacobian;

      // since we're doing y->xj,  the xj terms appear on top of the fraction
      let J = (Xj.jacobian.x / Y.jacobian.x) * abs(Xj.jacobian.y / Y.jacobian.y);
      let res = length(Xj.F) * J;

      denominator += res;
    }
  }

  //  TODO: what to do in this case? it did happen
  if (numerator == 0 && denominator == 0) { return 0; }

  return numerator / denominator;
}

fn SpatialResample(candidates: array<Reservoir, SR_CANDIDATES_COUNT>, tid: vec3u) -> Reservoir {
  // ******* important: first candidate is the current pixel's reservoir ***********
  // ******* I should probably update this function to reflect that ***********
  
  var r = Reservoir(
    // it's important that we set tid.xy as the path seed here, read
    // the note inside generalizedBalanceHeuristic to understand why.
    // In this case, it's important because for next spatial iterations
    // when we return the reservoir, we have to set it as a valid pixel, by
    // assigning something other that -1,-1 to the seed value
    PathInfo(vec3f(0.0), vec2i(tid.xy), 0, 0, 0, -1, vec2f(0), vec3f(0), vec3f(0), vec2f(0), vec2i(-1)),
    vec2i(tid.xy), candidates[0].Gbuffer, 0.0, 0.0, 0.0, 1.0,
  );
  let M: i32 = SR_CANDIDATES_COUNT;

  for (var i: i32 = 0; i < M; i++) {
    /* 
      since the very first candidate is this pixel's reservoir, 
      I can probably avoid the random replay
      and optimize that part away
    */
    let Xi = candidates[i];
    if (Xi.isNull > 0) { 
      // we weren't able to generate a path for this candidate, thus skip it
      continue; 
    }
    let randomReplayResult = randomReplay(Xi.Y, tid);
    // remember that the random-replay will end up creating a new path-info
    // that computed internally a different jacobian compared to the jacobian
    // that is saved in the original path Xi.Y. This is the real difference between
    // Y and X when it's presented in section 5 of the ReSTIR guide
    let X = Xi.Y;
    var Y = Xi.Y;
    Y.F = randomReplayResult.pHat;
    Y.jacobian = randomReplayResult.jacobian;

    let jacobian = (Y.jacobian.x / X.jacobian.x) * abs(Y.jacobian.y / X.jacobian.y);
    let Wxi = Xi.Wy * jacobian;
    var wi = 0.0;

    if (randomReplayResult.valid > 0) {
      let mi = generalizedBalanceHeuristic(X, Y, i, candidates);
      wi = mi * length(Y.F) * Wxi;    
    } else {
      
    }

    if (wi > 0.0) {
      let updated = updateReservoir(&r, Y, wi);
    }
  }

  if (r.isNull <= 0.0) {
    r.Wy = 1 / length(r.Y.F) * r.wSum;
  }

  return r;
}

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
    var candidates = array<Reservoir, SR_CANDIDATES_COUNT>();
    var normal0 = vec3f(0.0);
    var depth0 = 0.0;
    for (var i = 0; i < SR_CANDIDATES_COUNT; i++) {
      if (i == 0) {
        candidates[i] = restirPassInput[idx];
        normal0 = candidates[i].Gbuffer.xyz;
        depth0 = candidates[i].Gbuffer.w;
      } else {
        // uniform circle sampling 
        let circleRadiusInPixels = 15.0;
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
              PathInfo(vec3f(0.0), vec2i(-1, -1), 0, 0, 0, -1, vec2f(0), vec3f(0), vec3f(0), vec2f(0), vec2i(-1)),
              vec2i(-1, -1), vec4f(0,0,0,-1), 0.0, 0.0, 0.0, 1.0,
            );
          }
        } else {
          candidates[i] = Reservoir(
            PathInfo(vec3f(0.0), vec2i(-1, -1), 0, 0, 0, -1, vec2f(0), vec3f(0), vec3f(0), vec2f(0), vec2i(-1)),
            vec2i(-1, -1), vec4f(0,0,0,-1), 0.0, 0.0, 0.0, 1.0,
          );
        }
      }
    }
  
    reservoir = SpatialResample(candidates, tid);
    if (reservoir.isNull < 0.0) {
      // theoretically we shouldn't re-use Y.F but for now we'll do it
      rad = reservoir.Y.F * reservoir.Wy;
    }
  }

  // https://www.w3.org/TR/WGSL/#storageBarrier-builtin
  // https://stackoverflow.com/questions/72035548/what-does-storagebarrier-in-webgpu-actually-do
  // "storageBarrier coordinates access by invocations in single workgroup 
  // to buffers in 'storage' address space."
  storageBarrier();

  // every thread needs to be able to reach the storageBarrier for us to be able to use it,
  // so early returns can only happen afterwards
  if (isOutOfScreenBounds) {
    return;
  }

  restirPassInput[idx] = reservoir;

  if (finalPass == 1) {
    if (debugInfo.isSelectedPixel) {
      // debugLog(999);
      radianceOutput[idx] += vec3f(1, 0, 0);
    } else {
      radianceOutput[idx] += rad;
    }
  }
}
`;
}
