import { AABB } from '$lib/bvh/aabb';
import { Dielectric } from '$lib/materials/dielectric';
import { TorranceSparrow } from '$lib/materials/torranceSparrow';
import { Triangle } from '$lib/primitives/triangle';
import { mathUtilsPart } from './parts/mathUtils';
import { pbrtMathUtilsPart } from './parts/pbrtMathUtils';
import { randomPart } from './parts/random';

export const multiScatterLUTTestShader = /* wgsl */ `
// at the moment these have to be imported with this specific order
${randomPart}
${mathUtilsPart}
${pbrtMathUtilsPart}
${AABB.shaderStruct()}
${Triangle.shaderStruct()}
${TorranceSparrow.shaderBRDF()}
${Dielectric.shaderStruct()}
${Dielectric.shaderBRDF()}

@group(0) @binding(0) var<storage, read_write> LUTOutput: array<f32>;
@group(0) @binding(1) var<uniform> LUTSize: vec3u;
@group(0) @binding(2) var<uniform> uRands: vec4f;
@group(0) @binding(3) var ESSlut: texture_3d<f32>;
@group(0) @binding(4) var EAVGlut: texture_2d<f32>;
@group(0) @binding(5) var ESSIlut: texture_3d<f32>;
@group(0) @binding(6) var EAVGIlut: texture_2d<f32>;

fn getFavg(eta: f32) -> f32 {
  if (eta >= 1 && eta <= 400) {
    return (eta - 1.0) / (4.08567 + 1.00071 * eta); 
  }
  if (eta >= 0 && eta < 1) {
    return 0.997118 + 0.1014 * eta - 0.965241 * eta * eta - 0.130607 * eta * eta * eta;
  }
  return 0;
}

fn integrateDielectricE_withImportance(samples: u32, gid: vec3u) -> f32 {
  // it's important that we consider that this is the roughness value
  // at the "center" of the pixel
  // this is necessary to get correct values when using bilinear interpolation
  let roughness = (f32(gid.x) + 0.5) / f32(LUTSize.x);
  // same for dotVN, we need the value at the "center" of the pixel 
  // let dotVN = (f32(gid.y) + 0.5) / f32(LUTSize.y) * 2.0 - 1.0;
  var dotVN = (f32(gid.y) + 0.5) / f32(LUTSize.y) * -2.0 + 1.0;
  if (dotVN == 0.0) { dotVN = 0.001; }
  let eta = 1.0 + (f32(gid.z) + 0.5) / f32(LUTSize.z) * 2.0;

  let woTheta = acos(dotVN);
  let wo = normalize(vec3f(sin(woTheta), 0, dotVN));
  let wg = vec3f(0, 0, 1);

  var integral: f32 = 0;
  for (var i: u32 = 0; i < samples; i++) {
    let axay = anisotropyRemap(roughness, 0.0);
    let ax = axay.x;
    let ay = axay.y;

    var ru32s: u32 = 0;
    if (i % 2 == 0) { ru32s = u32(uRands.x * 928473289 + uRands.y * 875973289); } 
    if (i % 2 == 1) { ru32s = u32(uRands.z * 928473289 + uRands.w * 875973289); } 

    let rands = rand4(
      gid.y * LUTSize.x * 178 + gid.x * 91 + ru32s + u32(i * 173759),
    );

    let material = DIELECTRIC(vec3f(1.0), ax, ay, eta, 0, vec2f(0), vec2f(0), vec2i(0), vec2i(0), vec2i(0));

    var wi = vec3f(0);
    var brdf: vec3f;
    var pdf: f32;
    Dielectric_Sample_f(wo, material, rands, &wi, &pdf, &brdf);


    let ESS_eta_wo = textureLoad(ESSlut, vec3u(gid.x, gid.y, gid.z), 0).x;
    let ESS_eta_wi = textureLoad(ESSlut, vec3u(gid.x, u32((1.0 - (dot(wi, wg) * 0.5 + 0.5)) * 16), gid.z), 0).x;
    let ESS_etai_wo = textureLoad(ESSIlut, vec3u(gid.x, gid.y, gid.z), 0).x;
    let ESS_etai_wi = textureLoad(ESSIlut, vec3u(gid.x, u32((1.0 - (dot(wi, wg) * 0.5 + 0.5)) * 16), gid.z), 0).x;
    let Favg = getFavg(eta);
    let FavgI = getFavg(1.0 / eta);
    let Eavg  = textureLoad(EAVGlut, vec2u(gid.x, gid.z), 0).x;
    let EavgI = textureLoad(EAVGIlut, vec2u(gid.x, gid.z), 0).x;
    
    if (wo.z > 0) {
      let fmsr = Favg * (1.0 - ESS_eta_wo) * (1.0 - ESS_eta_wi) / (PI * (1.0 - Eavg));
      let fmst = (1.0 - Favg) * (1.0 - ESS_eta_wo) * (1.0 - ESS_etai_wi) / (PI * (1.0 - EavgI));
    
      let a = (1.0 - Favg) / (1.0 - EavgI);
      let b = (1.0 - FavgI) / (1.0 - Eavg) * eta * eta;
      let x = b / (a + b);

      brdf += fmsr + x * fmst;
      // brdf /= ESS_eta_wo;
    } else {
      brdf = vec3(0.0);
    }

    if (isFloatNaN(pdf) || pdf == 0.0) {
      pdf = 1.0;
      brdf = vec3f(0.0);
    }

    let sample = (brdf.x / pdf) * abs(dot(wi, wg));
    integral += sample;
  }

  integral /= f32(samples);
  return integral;
}

@compute @workgroup_size(8, 8, 1) fn compute(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  if (gid.x >= LUTSize.x || gid.y >= LUTSize.y || gid.z >= LUTSize.z) { return; }
  let idx = gid.z * LUTSize.x * LUTSize.y + gid.y * LUTSize.x + gid.x;

  let samples: u32 = 100000;

  LUTOutput[idx] += integrateDielectricE_withImportance(samples, gid.xyz);
}
`;
