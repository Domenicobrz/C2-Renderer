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

struct PathFlags {
  lightSampled: bool,
  brdfSampled: bool,
  endsInEnvmap: bool,
  reconnects: bool,
  reconnectionLobes: vec2u,
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

fn pathReconnects(pi: PathInfo) -> bool {
  return ((pi.flags >> 3) & 1u) == 1;
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

fn packPathFlags(flags: PathFlags) -> u32 {
  var pathFlags: u32 = 0u; // Use 0u for clarity
  pathFlags |= (u32(flags.lightSampled) << 0u); // u32(bool) is 0u or 1u, so & 1u is not strictly needed
  pathFlags |= (u32(flags.brdfSampled) << 1u);
  pathFlags |= (u32(flags.endsInEnvmap) << 2u);
  pathFlags |= (u32(flags.reconnects) << 3u);  // remember to update pathReconnects(...) if you move this one around
  // Bits 4-15 are currently unused
  // 0xFFu is 255 in decimal, or 0b11111111
  pathFlags |= ((flags.reconnectionLobes.x & 0xFFu) << 16u);
  pathFlags |= ((flags.reconnectionLobes.y & 0xFFu) << 24u);
  return pathFlags;
}

fn unpackPathFlags(packed: u32) -> PathFlags {
  var flags: PathFlags;
  flags.lightSampled = bool((packed >> 0u) & 1u); // bool(u32) converts 0u to false, non-0u to true
  flags.brdfSampled = bool((packed >> 1u) & 1u);
  flags.endsInEnvmap = bool((packed >> 2u) & 1u);
  flags.reconnects = bool((packed >> 3u) & 1u);
  flags.reconnectionLobes.x = (packed >> 16u) & 0xFFu;
  flags.reconnectionLobes.y = (packed >> 24u) & 0xFFu;
  return flags;
}

fn packDomain(domain: vec2i) -> u32 {
  let x_packed: u32 = u32(domain.x) & 0xFFFFu;
  let y_packed: u32 = (u32(domain.y) & 0xFFFFu) << 16u;
  return x_packed | y_packed;
}

fn unpackDomain(packedDomain: u32) -> vec2i {
  var domain: vec2i;
  let x_unsigned16: u32 = packedDomain & 0xFFFFu;
  domain.x = (i32(x_unsigned16 << 16u)) >> 16; 
  let y_unsigned16: u32 = (packedDomain >> 16u) & 0xFFFFu;
  domain.y = (i32(y_unsigned16 << 16u)) >> 16;
  return domain;
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
