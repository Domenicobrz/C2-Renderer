import { AABB } from '$lib/bvh/aabb';
import { BVH } from '$lib/bvh/bvh';
import { configManager } from '$lib/config';
import { Diffuse } from '$lib/materials/diffuse';
import { Emissive } from '$lib/materials/emissive';
import { TorranceSparrow } from '$lib/materials/torranceSparrow';
import { Material, MATERIAL_TYPE } from '$lib/materials/material';
import { Triangle } from '$lib/primitives/triangle';
import { mathUtilsPart } from '../parts/mathUtils';
import { pbrtMathUtilsPart } from '../parts/pbrtMathUtils';
import { randomPart } from '../parts/random';
import { Dielectric } from '$lib/materials/dielectric';
import { PC2D } from '$lib/samplers/PiecewiseConstant2D';
import { PC1D } from '$lib/samplers/PiecewiseConstant1D';
import { Envmap } from '$lib/envmap/envmap';
import { Camera } from '$lib/controls/Camera';
import { Plane } from '$lib/primitives/plane';
import { misPart } from '../parts/mis';
import { texturePart } from '../parts/texture';
import { shadingNormalsPart } from '../parts/shadingNormal';
import type { LUTManager } from '$lib/managers/lutManager';
import { getRandomPart, getReSTIRRandomPart } from '../parts/getRandom';
import { EONDiffuse } from '$lib/materials/EONDiffuse';
import { tempShadCopy } from './tempShadCopy';

export function getReSTIRPTSRShader(lutManager: LUTManager) {
  return /* wgsl */ `
// keep in mind that configManager.shaderPart() might return different shader code if the
// internal shader configs have changed
${configManager.shaderPart()}
// at the moment these have to be imported with this specific order
${randomPart}
${mathUtilsPart}
${pbrtMathUtilsPart}
${misPart}
${texturePart}
${shadingNormalsPart}
${getRandomPart}
${getReSTIRRandomPart}
${lutManager.getShaderPart()}
${Emissive.shaderStruct()}
${Emissive.shaderCreateStruct()}
${Emissive.shaderShadeEmissive()}
${Diffuse.shaderStruct()}
${Diffuse.shaderCreateStruct()}
${'' /* Diffuse.shaderShadeDiffuse() */}
${'' /* EONDiffuse.shaderStruct() */}
${'' /* EONDiffuse.shaderCreateStruct() */}
${'' /* EONDiffuse.shaderShadeEONDiffuse() */}
${'' /* TorranceSparrow.shaderStruct() */}
${'' /* TorranceSparrow.shaderCreateStruct() */}
${'' /* TorranceSparrow.shaderBRDF() */}
${'' /* TorranceSparrow.shaderShadeTorranceSparrow() */}
${'' /* Dielectric.shaderStruct() */}
${'' /* Dielectric.shaderCreateStruct() */}
${'' /* Dielectric.shaderBRDF() */}
${'' /* Dielectric.shaderShadeDielectric() */}
${'' /* Material.shaderShade() */}
${Camera.shaderStruct()}
${Camera.shaderMethods()}
${Triangle.shaderStruct()}
${Triangle.shaderIntersectionFn()}
${AABB.shaderStruct()}
${AABB.shaderIntersect()}
${BVH.shaderStruct()}
${BVH.shaderIntersect()}
${PC1D.shaderStruct()}
${PC1D.shaderMethods()}
${PC2D.shaderStruct()}
${PC2D.shaderMethods()}
${Envmap.shaderStruct()}
${Envmap.shaderMethods()}
${Plane.shaderMethods()}

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

struct DebugInfo {
  tid: vec3u,
  isSelectedPixel: bool,
  bounce: i32,
  sample: u32,
  debugLogIndex: u32,
} 
// https://www.w3.org/TR/WGSL/#address-spaces-private
var<private> debugInfo = DebugInfo(vec3u(0,0,0), false, 0, 0, 0);
fn debugLog(value: f32) {
  debugBuffer[debugInfo.debugLogIndex] = value;
  debugInfo.debugLogIndex++;
}


struct PathInfo {
  F: vec3f,
  seed: vec2i,
  bounceCount: u32,
  // bit 0: path ends by NEE boolean
  // bit 1: path ends by BRDF sampling boolean (we found a light)
  // bit 2: path ends by escape boolean
  // in theory, the remaining bits could contain the bounce count
  flags: u32,
}

struct Reservoir {
  Y: PathInfo,
  Gbuffer: vec4f, // normal.xyz, depth at first bounce. depth = -1 if no intersection was found
  Wy: f32,  // probability chain
  c: f32,
  wSum: f32,
  isNull: f32,
}

struct RandomReplayResult {
  valid: u32,
  pHat: vec3f,
}

struct RandomReplayStepResult {
  terminatedByNEE: bool,
  pHat: vec3f,
}

const SR_CANDIDATES_COUNT = 3;

fn getLuminance(emission: vec3f) -> f32 {
  return 0.2126 * emission.x + 0.7152 * emission.y + 0.0722 * emission.z;
}

${tempShadCopy}

fn shadeDiffuse(
  ires: BVHIntersectionResult, 
  ray: ptr<function, Ray>,
  pi: PathInfo,
  throughput: ptr<function, vec3f>, 
  tid: vec3u,
  i: i32
) -> RandomReplayStepResult {
  let hitPoint = ires.hitPoint;
  let material: Diffuse = createDiffuse(ires.triangle.materialOffset);

  var color = material.color;
  if (material.mapLocation.x > -1) {
    color *= getTexelFromTextureArrays(material.mapLocation, ires.uv, material.mapUvRepeat).xyz;
  }

  var vertexNormal = ires.normal;
  // the normal flip is calculated using the geometric normal to avoid
  // black edges on meshes displaying strong smooth-shading via vertex normals
  if (dot(ires.triangle.geometricNormal, (*ray).direction) > 0) {
    vertexNormal = -vertexNormal;
  }
  var N = vertexNormal;
  var bumpOffset: f32 = 0.0;
  if (material.bumpMapLocation.x > -1) {
    N = getShadingNormal(
      material.bumpMapLocation, material.bumpStrength, material.uvRepeat, N, *ray, 
      ires, &bumpOffset
    );
  }

  let x0 = ray.origin;
  let x1 = ires.hitPoint;

  // needs to be the exact origin, such that getLightSample/getLightPDF can apply a proper offset 
  (*ray).origin = ires.hitPoint;
  // in practice however, only for Dielectrics we need the exact origin, 
  // for Diffuse we can apply the bump offset if necessary
  if (bumpOffset > 0.0) {
    (*ray).origin += vertexNormal * bumpOffset;
  }

  // rands1.w is used for ONE_SAMPLE_MODEL
  // rands1.xy is used for brdf samples
  // rands2.xyz is used for light samples (getLightSample(...) uses .xyz)
  let rands1 = vec4f(getRand2D(), getRand2D());
  let rands2 = vec4f(getRand2D(), getRand2D());

  var brdf = color / PI;
  var colorLessBrdf = 1.0 / PI;

  var brdfSamplePdf: f32; var brdfMisWeight: f32; 
  var lightSamplePdf: f32; var lightMisWeight: f32; var lightSampleRadiance: vec3f;
  var rayBrdf = Ray((*ray).origin, (*ray).direction);
  var rayLight = Ray((*ray).origin, (*ray).direction);

  shadeDiffuseSampleBRDF(rands1, N, &rayBrdf, &brdfSamplePdf, &brdfMisWeight, ires);
  shadeDiffuseSampleLight(rands2, N, &rayLight, &lightSamplePdf, &lightMisWeight, &lightSampleRadiance);

  (*ray).origin += rayBrdf.direction * 0.001;
  (*ray).direction = rayBrdf.direction;

  var rrStepResult = RandomReplayStepResult(false, vec3f(0.0));

  if (length(lightSampleRadiance) > 0.0) {
    let mi = 1.0;
    // for now it's easier to only consider NEE - we avoid having to deal with Emissive materials
    let pHat = lightSampleRadiance * (/*lightMisWeight*/ 1.0 / lightSamplePdf) * *throughput * 
               brdf * max(dot(N, rayLight.direction), 0.0);
    // let Wxi = 1.0; // *wxi * (1.0 / lightSamplePdf);
    // let wi = mi * length(pHat) * Wxi;

    if (pi.bounceCount == u32(debugInfo.bounce)) {
      rrStepResult.terminatedByNEE = true;
      rrStepResult.pHat = pHat;
    }

    // updateReservoir uses a different set of random numbers, exclusive for ReSTIR,
    // no need to skip numbers here
    // updateReservoir(reservoir, pathInfo, wi);
  }

  *throughput *= brdf * (/* mis weight */ 1.0 / brdfSamplePdf) * max(dot(N, rayBrdf.direction), 0.0); 

  return rrStepResult;
}

fn randomReplay(pi: PathInfo, tid: vec3u) -> RandomReplayResult {
  let idx = tid.y * canvasSize.x + tid.x;

  // debugInfo.tid = tid;
  // debugInfo.isSelectedPixel = false;
  // if (debugPixelTarget.x == tid.x && debugPixelTarget.y == tid.y) {
  //   debugInfo.isSelectedPixel = true;
  // }

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
    return RandomReplayResult(0, vec3f(0));
  }

  var throughput = vec3f(1.0);
  var rad = vec3f(0.0);
  for (var i = 0; i < config.BOUNCES_COUNT; i++) {
    if (rayContribution == 0.0) { break; }

    debugInfo.bounce = i;

    let ires = bvhIntersect(ray);

    if (ires.hit) {
      let rrStepResult = shadeDiffuse(ires, &ray, pi, &throughput, tid, i);
      
      if (pi.bounceCount == u32(debugInfo.bounce) && rrStepResult.terminatedByNEE) {
        return RandomReplayResult(1, rrStepResult.pHat);
      }
    } 
    // ..... missing stuff .....
  }

  return RandomReplayResult(0, vec3f(0));
}

fn generalizedBalanceHeuristic(
  XiPi: PathInfo, pHatXi: vec3f, idx: i32, candidates: array<Reservoir, SR_CANDIDATES_COUNT>
) -> f32 {
  let numerator = length(pHatXi);
  var denominator = length(pHatXi);

  for (var i = 0; i < SR_CANDIDATES_COUNT; i++) {
    if (i == idx) { continue; }

    let Xj = candidates[i];

    // there's a big difference between a null candidate path, and a null candidate
    // if one of the ""candidates"" is outside of the screen boundaries, we're not simply
    // stating that the reservoir is null. It's just totally unuseable, there can't be any path
    // associated with a pixel outside the screen boundaries. Nothing at all, none.
    // However, some nearby pixels might have been unable to find a candidate path Y, but *must* still
    // be tested in the generalized balance heuristic. They may have failed to generate a candidate
    // path, but they may be able to successfully random replay the path we're testing here with XiPi
    // Thus they must be considered and used here otherwise we'll gain energy where we shouldn't.
    // This is the reason why we're only checking if the candidate has a negative seed, that means
    // that the ""candidate"" is one of those samples that fell outside the screen boundaries and is thus 
    // unuseable. This would have been easier if we had access to a dynamic array but sadly we can't
    // same applies for candidates that have been removed because of Gbuffer differences

    // if (Xj.isNull > 0) { continue; }
    if (Xj.Y.seed.x < 0) { continue; }

    // shift the Xi path into Xj's pixel (seed is effectively tid.xy)
    let randomReplayResult = randomReplay(XiPi, vec3u(vec2u(Xj.Y.seed), 0));

    if (randomReplayResult.valid > 0) {
      let res = length(randomReplayResult.pHat);
      denominator += res;
    }
  }

  //  TODO: what to do in this case? it did happen
  if (numerator == 0 && denominator == 0) { return 0; }

  return numerator / denominator;
}

fn updateReservoir(reservoir: ptr<function, Reservoir>, Xi: PathInfo, wi: f32) -> bool {
  (*reservoir).wSum = (*reservoir).wSum + wi;
  let prob = wi / (*reservoir).wSum;

  if (getRand2D_2().x < prob) {
    (*reservoir).Y = Xi;
    (*reservoir).isNull = -1.0;
  
    return true;
  }

  return false;
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
    PathInfo(vec3f(0.0), vec2i(tid.xy), 0, 0),
    candidates[0].Gbuffer, 0.0, 0.0, 0.0, 1.0,
  );
  let M: i32 = SR_CANDIDATES_COUNT;

  var YpHat = vec3f(0.0); 

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

    let Wxi = Xi.Wy;
    let randomReplayResult = randomReplay(Xi.Y, tid);
    var wi = 0.0;

    if (randomReplayResult.valid > 0) {
      let mi = generalizedBalanceHeuristic(Xi.Y, Xi.Y.F, i, candidates);
      wi = mi * length(randomReplayResult.pHat) * Wxi;
      // wi = 0.5 * length(randomReplayResult.pHat) * Wxi;
    } else {
      
    }

    if (wi > 0.0) {
      let updated = updateReservoir(&r, Xi.Y, wi);
      if (updated) {
        YpHat = randomReplayResult.pHat;
      }
    }
  }

  if (r.isNull <= 0.0) {
    r.Wy = 1 / length(YpHat) * r.wSum;
    // theoretically we shouldn't re-use Y.F but for now we'll do it
    r.Y.F = YpHat;
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
        let circleRadiusInPixels = 25.0;
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
              PathInfo(vec3f(0.0), vec2i(-1, -1), 0, 0),
              vec4f(0,0,0,-1), 0.0, 0.0, 0.0, 1.0,
            );
          }
        } else {
          candidates[i] = Reservoir(
            PathInfo(vec3f(0.0), vec2i(-1, -1), 0, 0),
            vec4f(0,0,0,-1), 0.0, 0.0, 0.0, 1.0,
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
