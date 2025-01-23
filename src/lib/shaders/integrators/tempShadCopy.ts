import { MATERIAL_TYPE } from '$lib/materials/material';

export const tempShadCopy = /*wgsl*/ `
fn shade(
  ires: BVHIntersectionResult, 
  ray: ptr<function, Ray>,
  reservoir: ptr<function, Reservoir>,
  throughput: ptr<function, vec3f>, 
  pi: PathInfo,
  lastBrdfMis: ptr<function, f32>, 
  isRandomReplay: bool,
  tid: vec3u,
  i: i32
) -> RandomReplayResult {
  let materialOffset = ires.triangle.materialOffset;
  let materialType = materialsData[materialOffset];

  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    return shadeDiffuse(ires, ray, reservoir, throughput, pi, lastBrdfMis, isRandomReplay, tid, i);
  }

  // if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
  //   return shadeEmissive(ires, ray, reservoir, throughput, lastBrdfMis, tid, i);
  // }

  return RandomReplayResult(0, vec3f(0.0));
}
`;
