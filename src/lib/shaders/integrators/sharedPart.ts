import { AABB } from '$lib/bvh/aabb';
import { BVH } from '$lib/bvh/bvh';
import { ReSTIRConfigManager } from '$lib/config';
import { Camera } from '$lib/controls/Camera';
import { Envmap } from '$lib/envmap/envmap';
import type { LUTManager } from '$lib/managers/lutManager';
import { Dielectric } from '$lib/materials/dielectric';
import { Diffuse } from '$lib/materials/diffuse';
import { Emissive } from '$lib/materials/emissive';
import { TorranceSparrow } from '$lib/materials/torranceSparrow';
import { Plane } from '$lib/primitives/plane';
import { Triangle } from '$lib/primitives/triangle';
import { PC1D } from '$lib/samplers/PiecewiseConstant1D';
import { PC2D } from '$lib/samplers/PiecewiseConstant2D';
import { TileSequence } from '$lib/tile';
import { mathUtilsPart } from '../parts/mathUtils';
import { misPart } from '../parts/mis';
import { pbrtMathUtilsPart } from '../parts/pbrtMathUtils';
import { randomPart } from '../parts/random';
import { shadingNormalsPart } from '../parts/shadingNormal';
import { texturePart } from '../parts/texture';
import { resampleLogic } from './resampleLogic';
import { reservoirShaderPart } from './reservoir';
import { getReSTIRRandomPart } from './restirRandomPart';
import { tempShadCopy } from './tempShadCopy';

export function getReSTIRPTSharedPart(lutManager: LUTManager, configManager: ReSTIRConfigManager) {
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
${getReSTIRRandomPart}
${lutManager.getShaderPart()}
${TileSequence.shaderPart()}
${Emissive.shaderStruct()}
${Emissive.shaderCreateStruct()}
${'' /* Emissive.shaderShadeEmissive() */}
${'' /* Diffuse.shaderStruct() */}
${'' /* Diffuse.shaderCreateStruct() */}
${'' /* Diffuse.shaderShadeDiffuse() */}
${'' /* EONDiffuse.shaderStruct() */}
${'' /* EONDiffuse.shaderCreateStruct() */}
${'' /* EONDiffuse.shaderShadeEONDiffuse() */}
${'' /* TorranceSparrow.shaderStruct() */}
${'' /* TorranceSparrow.shaderCreateStruct() */}
${TorranceSparrow.shaderBRDF()}
${'' /* TorranceSparrow.shaderShadeTorranceSparrow() */}
${'' /* Dielectric.shaderStruct() */}
${'' /* Dielectric.shaderCreateStruct() */}
${Dielectric.shaderBRDF()}
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
  debugLogIndex: u32,
} 
// https://www.w3.org/TR/WGSL/#address-spaces-private
var<private> debugInfo = DebugInfo(vec3u(0,0,0), false, 0, 0);
fn debugLog(value: f32) {
  if (debugInfo.isSelectedPixel) {
    debugBuffer[debugInfo.debugLogIndex] = value;
    debugInfo.debugLogIndex++;
  }
}

${reservoirShaderPart}

// this struct does not have to be saved in the reservoir,
// hence why we're creating a separate struct
struct PathSampleInfo {

  // some of these might be unnecessary now that I'm always reconnecting at xkm1
  wasPrevVertexRough: bool,
  prevVertexPosition: vec3f,
  prevVertexBrdf: vec3f,
  brdfPdfPrevVertex: f32,
  lobePdfPrevVertex: f32,
  reconnectionVertexIndex: i32, // -1 signals no reconnection
  postfixThroughput: vec3f,
  prevLobeIndex: i32,
}

struct RandomReplayResult {
  valid: u32,
  pHat: vec3f,
  shouldTerminate: bool,
  jacobian: vec2f,
}

fn isSegmentTooShortForReconnection(segment: vec3f) -> bool {
  // return length(segment) < 0.05;
  return length(segment) < 0.15;
  // return length(segment) < 0.5;
  // return length(segment) < 0.85;
  // return length(segment) < 2.5;
  // return false;
  // return true;
}

fn pathEndsInEnvmap(pi: PathInfo) -> bool {
  return ((pi.flags >> 2) & 1) == 1;
}

fn pathIsLightSampled(pi: PathInfo) -> bool {
  return (pi.flags & 1) > 0;
}

fn pathIsBrdfSampled(pi: PathInfo) -> bool {
  return (pi.flags & 2) > 0;
}

// not currently being used
// fn pathHasLobeIndex(pi: PathInfo, lobeIndex: u32) -> bool {
//   return (pi.flags >> 16) == lobeIndex;
// }

fn pathReconnects(pi: PathInfo) -> bool {
  return ((pi.flags >> 3) & 1) == 1;
}

fn pathDoesNotReconnect(pi: PathInfo) -> bool {
  return !pathReconnects(pi);
}

fn pathReconnectsAtLightVertex(pi: PathInfo) -> bool {
  return pathReconnects(pi) && pi.bounceCount == pi.reconnectionBounce;
}

fn pathReconnectsFarFromLightVertex(pi: PathInfo) -> bool {
  return pathReconnects(pi) && pi.bounceCount >= (pi.reconnectionBounce+2);
}

fn pathReconnectsOneVertextBeforeLight(pi: PathInfo) -> bool {
  return pathReconnects(pi) && pi.bounceCount == (pi.reconnectionBounce+1);
}

const endsInEnvmapBitPosition: u32 = 2u;
fn setEndsInEnvmapFlag(existingFlags: u32, shouldEndInEnvmap: bool) -> u32 {
  const endsInEnvmapMask: u32 = (1u << endsInEnvmapBitPosition); // 0x00000004

  var modifiedFlags: u32 = existingFlags;
  if (shouldEndInEnvmap) {
    modifiedFlags = modifiedFlags | endsInEnvmapMask;
  } else {
    modifiedFlags = modifiedFlags & (~endsInEnvmapMask);
  }

  return modifiedFlags;
}

fn setPathFlags(
  lobeIndex: u32, lightSampled: u32, brdfSampled: u32, endsInEnvmap: u32, reconnects: u32
) -> u32 {
  var pathFlags: u32 = 0;
  pathFlags |= (lightSampled << 0);
  pathFlags |= (brdfSampled << 1);
  pathFlags |= (endsInEnvmap << endsInEnvmapBitPosition);
  pathFlags |= (reconnects << 3);
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
) -> bool {
  (*reservoir).wSum = (*reservoir).wSum + wi;
  (*reservoir).c = (*reservoir).c + ci;
  let prob = wi / (*reservoir).wSum;

  if (getRand2D_2().x < prob) {
    (*reservoir).Y = Xi;
    (*reservoir).isNull = -1.0;
    return true;
  }
  
  return false;
} 

fn getLuminance(emission: vec3f) -> f32 {
  return 0.2126 * emission.x + 0.7152 * emission.y + 0.0722 * emission.z;
}

${tempShadCopy}
${resampleLogic(configManager)}
`;
}
