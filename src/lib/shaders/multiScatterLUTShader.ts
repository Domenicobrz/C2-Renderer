import { AABB } from '$lib/bvh/aabb';
import { TorranceSparrow } from '$lib/materials/torranceSparrow';
import { Triangle } from '$lib/primitives/triangle';
import { mathUtilsPart } from './parts/mathUtils';
import { pbrtMathUtilsPart } from './parts/pbrtMathUtils';
import { randomPart } from './parts/random';

export const multiScatterLUTShader = /* wgsl */ `
// at the moment these have to be imported with this specific order
${randomPart}
${mathUtilsPart}
${pbrtMathUtilsPart}
${AABB.shaderStruct()}
${Triangle.shaderStruct()}
${TorranceSparrow.shaderBRDF()}

@group(0) @binding(0) var<storage, read_write> LUTOutput: array<f32>;
@group(0) @binding(1) var<uniform> LUTSize: vec2u;
@group(0) @binding(2) var<uniform> uRands: vec4f;

fn integrateE_withImportance(dotVN: f32, roughness: f32, samples: u32, gid: vec2u) -> f32 {
  let woTheta = acos(dotVN);
  let wo = normalize(vec3f(sin(woTheta), 0, dotVN));
  let F0 = vec3f(1, 1, 1);
  let F90: f32 = 1;
  let wg = vec3f(0, 0, 1);

  var integral: f32 = 0;
  for (var i: u32 = 0; i < samples; i++) {
    // let's use openPBR parameterization
    // let's use openPBR parameterization
    // let's use openPBR parameterization
    // let's use openPBR parameterization
    // let's use openPBR parameterization
    // let's use openPBR parameterization
    // https://academysoftwarefoundation.github.io/OpenPBR/#model/microfacetmodel
    // https://academysoftwarefoundation.github.io/OpenPBR/#model/microfacetmodel
    // https://academysoftwarefoundation.github.io/OpenPBR/#model/microfacetmodel
    // https://academysoftwarefoundation.github.io/OpenPBR/#model/microfacetmodel
    // blabla throw error

    let ax = roughness;
    let ay = roughness;

    var ru32s: u32 = 0;
    if (i % 2 == 0) { ru32s = u32(uRands.x * 928473289 + uRands.y * 875973289); } 
    if (i % 2 == 1) { ru32s = u32(uRands.z * 928473289 + uRands.w * 875973289); } 

    let rands = rand4(
      gid.y * LUTSize.x * 178 + gid.x * 91 + ru32s + u32(i * 173759),
    );

    var wi = vec3f(0);
    var brdf: vec3f;
    var pdf: f32;
    TS_Sample_f(wo, rands.xy, ax, ay, vec3f(1,1,1), &wi, &pdf, &brdf);

    if (isFloatNaN(pdf) || pdf == 0.0 || dot(wi, wg) < 0.0) {
      pdf = 1.0;
      brdf = vec3f(0.0);
    }

    let sample = (brdf.x / pdf) * dot(wi, wg);
    integral += sample;
  }

  integral /= f32(samples);
  return integral;
}

@compute @workgroup_size(8, 8) fn compute(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  if (gid.x >= LUTSize.x || gid.y >= LUTSize.y) { return; }
  let idx = gid.y * LUTSize.x + gid.x;

  let samples: u32 = 1000000;
  let roughness = (f32(gid.x) + 0.5) / f32(LUTSize.x);
  let dotVN = (f32(gid.y) + 0.5) / f32(LUTSize.y);

  LUTOutput[idx] += integrateE_withImportance(dotVN, roughness, samples, gid.xy);
}
`;
