import { AABB } from '$lib/bvh/aabb';
import { BVH } from '$lib/bvh/bvh';
import { configManager } from '$lib/config';
import { Camera } from '$lib/controls/Camera';
import { Envmap } from '$lib/envmap/envmap';
import type { LUTManager } from '$lib/managers/lutManager';
import { Diffuse } from '$lib/materials/diffuse';
import { Emissive } from '$lib/materials/emissive';
import { TorranceSparrow } from '$lib/materials/torranceSparrow';
import { Plane } from '$lib/primitives/plane';
import { Triangle } from '$lib/primitives/triangle';
import { PC1D } from '$lib/samplers/PiecewiseConstant1D';
import { PC2D } from '$lib/samplers/PiecewiseConstant2D';
import { getRandomPart, getReSTIRRandomPart } from '../parts/getRandom';
import { mathUtilsPart } from '../parts/mathUtils';
import { misPart } from '../parts/mis';
import { pbrtMathUtilsPart } from '../parts/pbrtMathUtils';
import { randomPart } from '../parts/random';
import { shadingNormalsPart } from '../parts/shadingNormal';
import { texturePart } from '../parts/texture';
import { tempDiffCopy } from './tempDiffuseCopy';
import { tempEmissiveCopy } from './tempEmissiveCopy';
import { tempShadCopy } from './tempShadCopy';
import { tempTorranceSparrowCopy } from './tempTorranceSparrowCopy';

export function getReSTIRPTSharedPart(lutManager: LUTManager) {
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
${TorranceSparrow.shaderStruct()}
${TorranceSparrow.shaderCreateStruct()}
${TorranceSparrow.shaderBRDF()}
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

// this struct will be saved in the reservoir
struct PathInfo {
  F: vec3f,
  seed: vec2i,
  bounceCount: u32,
  /* 
    bit 0: path-end sampled by Light boolean
    bit 1: path-end sampled by BRDF boolean
    bit 2: path ends by escape boolean
    bit 4-5:  
       00 no reconnection 
       01 reconnection at light_source 
       10 reconnection 1 before light_source 
       11 reconnection 2+ before light_source 
    in theory, the remaining bits could contain the bounce count
    bit 16 onward: lobe index
    theoretically, flags could also contain the bounce count
  */
  flags: u32,
  reconnectionBounce: i32,
  reconnectionTriangleIndex: i32,
  // these are the barycentric coordinates of the triangle, not the uvs.
  // to define a point within a triangle, we can't use texture uvs (they could be scaled/repeated)
  reconnectionBarycentrics: vec2f,  
  reconnectionRadiance: vec3f,
  reconnectionDirection: vec3f,
  jacobian: vec2f, 
}

// this struct does not have to be saved in the reservoir,
// hence why we're creating a separate struct
struct PathSampleInfo {
  wasPrevVertexRough: bool,
  prevVertexPosition: vec3f,
  brdfPdfPrevVertex: f32,
  lobePdfPrevVertex: f32,
}

const NO_RECONNECTION: u32 = 0;
const RECONNECTION_AT_LS: u32 = 1;
const RECONNECTION_ONE_BEFORE_LS: u32 = 2;
const RECONNECTION_MANY_BEFORE_LS: u32 = 3;

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
  shouldTerminate: bool,
  jacobian: vec2f,
}

fn pathIsLightSampled(pi: PathInfo) -> bool {
  return (pi.flags & 1) > 0;
}

fn pathIsBrdfSampled(pi: PathInfo) -> bool {
  return (pi.flags & 2) > 0;
}

fn pathHasLobeIndex(pi: PathInfo, lobeIndex: u32) -> bool {
  return (pi.flags >> 16) == lobeIndex;
}

fn pathDoesNotReconnect(pi: PathInfo) -> bool {
  return ((pi.flags >> 3) & 3) == NO_RECONNECTION;
}

fn pathReconnectsAtLightVertex(pi: PathInfo) -> bool {
  return ((pi.flags >> 3) & 3) == RECONNECTION_AT_LS;
}

fn pathReconnectsFarFromLightVertex(pi: PathInfo) -> bool {
  return ((pi.flags >> 3) & 3) == RECONNECTION_MANY_BEFORE_LS;
}

fn setPathFlags(lobeIndex: u32, lightSampled: u32, brdfSampled: u32, reconnection_type: u32) -> u32 {
  var pathFlags: u32 = 0;
  pathFlags |= (brdfSampled << 1);
  pathFlags |= (lightSampled << 0);
  pathFlags |= (reconnection_type << 3);
  pathFlags |= (lobeIndex << 16);
  return pathFlags;
}

fn updateReservoir(reservoir: ptr<function, Reservoir>, Y: PathInfo, wi: f32) -> bool {
  (*reservoir).wSum = (*reservoir).wSum + wi;
  let prob = wi / (*reservoir).wSum;

  if (getRand2D_2().x < prob) {
    (*reservoir).Y = Y;
    (*reservoir).isNull = -1.0;
    return true;
  }

  return false;
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
${tempTorranceSparrowCopy}
${tempShadCopy}
`;
}
