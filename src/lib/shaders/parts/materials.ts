import { Diffuse } from '$lib/materials/Diffuse';
import { Material } from '$lib/materials/Material';

export const materialsStructPart = /* wgsl */ `
  ${Diffuse.shaderStruct()}
  ${Diffuse.shaderCreateStruct()}

  ${Material.shaderMaterialSelection()}
`;
