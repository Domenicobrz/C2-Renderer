import { TorranceSparrow } from '$lib/materials/torranceSparrow';
import { mathUtilsPart } from './parts/mathUtils';
import { pbrtMathUtilsPart } from './parts/pbrtMathUtils';
import { randomPart } from './parts/random';
import { Dielectric } from '$lib/materials/dielectric';

export const multiScatterLUTShader = /* wgsl */ `
// at the moment these have to be imported with this specific order
${randomPart}
${mathUtilsPart}
${pbrtMathUtilsPart}
${TorranceSparrow.shaderStruct()}
${TorranceSparrow.shaderCreateStruct()}
${TorranceSparrow.shaderShadeTorranceSparrow()}
${Dielectric.shaderStruct()}
${Dielectric.shaderCreateStruct()}
${Dielectric.shaderShadeDielectric()}

@group(0) @binding(0) var<storage, read_write> LUTOutput: array<f32>;
@group(0) @binding(1) var<uniform> LUTSize: vec2i;

@compute @workgroup_size(8, 8) fn compute(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  if (gid.x >= LUTSize.x || gid.y >= LUTSize.y) { return; }
  let idx = gid.y * LUTSize.x + gid.x;

  LUTOutput[idx] += 1;
}
`;
