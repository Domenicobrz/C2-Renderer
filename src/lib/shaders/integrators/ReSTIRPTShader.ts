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
import { tempDiffCopy } from './tempDiffuseCopy';
import { tempShadCopy } from './tempShadCopy';
import { tempEmissiveCopy } from './tempEmissiveCopy';

export function getReSTIRPTShader(lutManager: LUTManager) {
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
${'' /* Emissive.shaderShadeEmissive() */}
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

// @group(0) @binding(0) var<storage, read_write> radianceOutput: array<vec3f>;
@group(0) @binding(0) var<storage, read_write> restirPassOutput: array<Reservoir>;
@group(0) @binding(1) var<storage, read_write> samplesCount: array<u32>;
@group(0) @binding(2) var<uniform> canvasSize: vec2u;

// on a separate bind group since camera changes more often than data/canvasSize
@group(1) @binding(0) var<uniform> camera: Camera;
// seems like maximum bindgroup count is 4 so I need to add the camera sample here 
// unfortunately and I can't create a separate bindgroup for it
@group(1) @binding(1) var<uniform> haltonSamples: array<vec4f, RANDOMS_VEC4F_ARRAY_COUNT>;
@group(1) @binding(2) var<uniform> uniformRandom: array<vec4f, RANDOMS_VEC4F_ARRAY_COUNT>;
@group(1) @binding(3) var<uniform> config: Config;
@group(1) @binding(4) var<uniform> finalPass: u32; // UNUSED: USED ONLY IN SR PASS

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
  if (debugInfo.isSelectedPixel) {
    debugBuffer[debugInfo.debugLogIndex] = value;
    debugInfo.debugLogIndex++;
  }
}

struct PathInfo {
  F: vec3f,
  seed: vec2i,
  bounceCount: u32,
  // bit 0: path ends by NEE boolean
  // bit 1: path ends by BRDF sampling boolean (we found a light)
  // bit 2: path ends by escape boolean
  // in theory, the remaining bits could contain the bounce count
  // bit 16 onward: lobe index
  flags: u32,
}

struct Reservoir {
  Y: PathInfo,
  // this will be used to make sure the path-shift selects the correct first bounce
  // remember that after the first SR reuse, we may end up using a seed that is different
  // from the seed that generated the first bounce hit. And the pixel-shift always have to land
  // on the original first bounce hit to be useable in the Generalized Balance Heuristic
  domain: vec2i,
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

fn pathEndsByNEE(pi: PathInfo) -> bool {
  return (pi.flags & 1) > 0;
}

fn pathEndsByBRDF(pi: PathInfo) -> bool {
  return (pi.flags & 2) > 0;
}

fn pathHasLobeIndex(pi: PathInfo, lobeIndex: u32) -> bool {
  return (pi.flags >> 16) == lobeIndex;
}

fn setPathFlags(lobeIndex: u32, endsByNEE: bool, endsByBRDF: bool) -> u32 {
  var pathFlags = lobeIndex; // lobe index
  pathFlags = pathFlags << 16;
  if (endsByNEE) { pathFlags |= 1; } 
  if (endsByBRDF) { pathFlags |= 2; } 
  return pathFlags;
}

fn updateReservoir(reservoir: ptr<function, Reservoir>, Xi: PathInfo, wi: f32) {
  (*reservoir).wSum = (*reservoir).wSum + wi;
  let prob = wi / (*reservoir).wSum;

  if (getRand2D_2().x < prob) {
    (*reservoir).Y = Xi;
    (*reservoir).isNull = -1.0;
  }
} 

fn updateReservoirWithConfidence(
  reservoir: ptr<function, Reservoir>, Xi: PathInfo, wi: f32, ci: f32
) {
  (*reservoir).wSum = (*reservoir).wSum + wi;
  (*reservoir).c = (*reservoir).c + ci;
  let prob = wi / (*reservoir).wSum;

  if (getRand2D_2().x < prob) {
    (*reservoir).Y = Xi;
    (*reservoir).isNull = -1.0;
  }
} 

fn getLuminance(emission: vec3f) -> f32 {
  return 0.2126 * emission.x + 0.7152 * emission.y + 0.0722 * emission.z;
}

${tempEmissiveCopy}
${tempDiffCopy}
${tempShadCopy}

// ***** Things to remember:  (https://webgpureport.org/)
// maxStorageBuffersPerShaderStage = 8
// maxUniformBuffersPerShaderStage = 12 (maxUniformBuffersPerShaderStage)
// maxBindingsPerBindGroup = 1000
// maxSampledTexturesPerShaderStage = 16
// maxTextureDimension3D = 2048

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
    PathInfo(vec3f(0.0), vec2i(tid.xy), 0, 0),
    vec2i(tid.xy), vec4f(0,0,0,-1), 0.0, 0.0, 0.0, 1.0,
  );

  initializeRandoms(tid, debugInfo.sample);
  initializeRandoms2(tid);

  var rayContribution: f32;
  var ray = getCameraRay(tid, idx, &rayContribution);

  var throughput = vec3f(1.0);
  var rad = vec3f(0.0);
  var lastBrdfMis = 1.0;
  for (var i = 0; i < config.BOUNCES_COUNT; i++) {
    if (rayContribution == 0.0) { break; }

    debugInfo.bounce = i;

    let ires = bvhIntersect(ray);

    let unusedPi = PathInfo();
    
    if (ires.hit) {
      shade(ires, &ray, &reservoir, &throughput, unusedPi, &lastBrdfMis, false, tid, i);
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

  if (reservoir.isNull <= 0.0) {
    reservoir.Wy = (1 / length(reservoir.Y.F)) * reservoir.wSum;
  }

  // IMPORTANT NOTE:
  // I think temporal resampling might require the *previous random numbers!*
  // at the moment I don't have a function that generates the numbers, they are provided
  // externally, and the "seed" is simply given by the "tid"s of the nearby pixels

  // let TEMPORAL_RIS_CAP = 4.0;
  // r.c = min(r.c, TEMPORAL_RIS_CAP);

  // temporal resample if there's temporal data to reuse
  // if (prevRestirData.r.c > 0.0) {
  //   var candidates = array<ReSTIRPassData, 2>();
  //   candidates[0] = restirData;
  //   candidates[1] = prevRestirData;
    
  //   let r = TemporalResample(candidates);
  //   restirData.r = r;
  // }

  // if (debugInfo.isSelectedPixel) {
  //   // debugLog(999);
  //   radianceOutput[idx] += vec3f(100, 0, 100);
  // } else {
  //   radianceOutput[idx] += rad * rayContribution;
  // }

  restirPassOutput[idx] = reservoir;
  samplesCount[idx] += 1;
}
`;
}
