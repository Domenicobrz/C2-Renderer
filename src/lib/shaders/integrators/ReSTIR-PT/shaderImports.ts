import { AABB } from '$lib/bvh/aabb';
import { BVH } from '$lib/bvh/bvh';
import { ReSTIRConfigManager } from '$lib/config';
import { Camera } from '$lib/controls/Camera';
import { Envmap } from '$lib/envmap/envmap';
import type { LUTManager } from '$lib/managers/lutManager';
import { Dielectric } from '$lib/materials/dielectric';
import { Diffuse } from '$lib/materials/diffuse';
import { Emissive } from '$lib/materials/emissive';
import { Material } from '$lib/materials/material';
import { TorranceSparrow } from '$lib/materials/torranceSparrow';
import { Plane } from '$lib/primitives/plane';
import { Triangle } from '$lib/primitives/triangle';
import { PC1D } from '$lib/samplers/PiecewiseConstant1D';
import { PC2D } from '$lib/samplers/PiecewiseConstant2D';
import { TileSequence } from '$lib/tile';
import { mathUtilsPart } from '../../parts/mathUtils';
import { misPart } from '../../parts/mis';
import { pbrtMathUtilsPart } from '../../parts/pbrtMathUtils';
import { randomPart } from '../../parts/random';
import { shadingNormalsPart } from '../../parts/shadingNormal';
import { texturePart } from '../../parts/texture';
import { pathConstruction } from './pathConstruction';
import { resampleLogic } from './resampleLogic';
import { reservoirShaderPart } from './reservoir';
import { reservoirFunctionsShaderPart } from './reservoirFunctions';
import { getReSTIRRandomPart } from './restirRandomPart';
import { rrPathConstruction } from './rrPathConstruction';
import { shade } from './shade';
import { tempDielectric } from './tempDielectric';
import { tempDiffuse2 } from './tempDiffuse2';
import { tempEmissive2 } from './tempEmissive2';
import { tempTorranceSparrow } from './tempTorranceSparrow';

export function getReSTIRPTShaderImports(
  lutManager: LUTManager,
  configManager: ReSTIRConfigManager
) {
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
${Material.shaderStruct()}
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
${reservoirShaderPart}
${reservoirFunctionsShaderPart}
${tempDiffuse2}
${tempEmissive2}
${tempTorranceSparrow}
${tempDielectric}
${pathConstruction}
${rrPathConstruction}
${shade}
${resampleLogic(configManager)}

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
`;
}
