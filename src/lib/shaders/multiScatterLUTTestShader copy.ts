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
  // "table targets"
  // let tx: u32 = 2;
  // let ty: u32 = 0;
  // let tz: u32 = 0;
  let tx: u32 = 4;
  let ty: u32 = 0;
  let tz: u32 = 2;

  // it's important that we consider that this is the roughness value
  // at the "center" of the pixel
  // this is necessary to get correct values when using bilinear interpolation
  let roughness = (f32(tx) + 0.5) / f32(16);
  // same for dotVN, we need the value at the "center" of the pixel 
  // let dotVN = (f32(gid.y) + 0.5) / f32(LUTSize.y) * 2.0 - 1.0;
  var dotVN = (f32(ty) + 0.5) / f32(16) * -2.0 + 1.0;
  if (dotVN == 0.0) { dotVN = 0.001; }
  let eta = 1.0 + (f32(tz) + 0.5) / f32(16) * 2.0;

  let woTheta = acos(dotVN);
  let wo = normalize(vec3f(sin(woTheta), 0, dotVN));
  let wg = vec3f(0, 0, 1);

  let Eavg  = textureLoad(EAVGlut, vec2u(tx, tz), 0).x;
  let EavgI = textureLoad(EAVGIlut, vec2u(tx, tz), 0).x;
  let ESS_eta_wo = textureLoad(ESSlut, vec3u(tx, ty, tz), 0).x;
  let ESS_etai_wo = textureLoad(ESSIlut, vec3u(tx, ty, tz), 0).x;
  let Favg = getFavg(eta);
  let FavgI = getFavg(1.0 / eta);

  var invalidSamplesCount = 0;

  var integral: f32 = 0;
  for (var i: u32 = 0; i < samples; i++) {
  // let nx: u32 = 200;
  // let ny: u32 = 500;  
  // for (var i: u32 = 0; i < nx; i++) {
  // for (var j: u32 = 0; j < ny; j++) {
    // let stepX = (2.0 * PI) / f32(nx);
    // let stepY = (2.0)      / f32(ny);

    let axay = anisotropyRemap(roughness, 0.0);
    let ax = axay.x;
    let ay = axay.y;

    var ru32s: u32 = 0;
    if (i % 2 == 0) { ru32s = u32(uRands.x * 928473289 + uRands.y * 875973289); } 
    if (i % 2 == 1) { ru32s = u32(uRands.z * 928473289 + uRands.w * 875973289); } 

    let rands = rand4(
      // gid.y * LUTSize.x * 178 + gid.x * 91 + ru32s + u32(i * 173759) + u32(j * 375149),
      gid.y * LUTSize.x * 178 + gid.x * 91 + ru32s + u32(i * 173759),
    );

    // // let t = (f32(j) + 0.5) / f32(ny);
    // let t = (f32(j) + rands.x) / f32(ny);
    // var ifl = t * 16;
    // // if (ifl < 0.5) { ifl = 0.5; }
    // // if (ifl > 15.5) { ifl = 15.5; }
    // let wiCosTheta = (ifl / 16) * -2 + 1;
    // let wiTheta = acos(wiCosTheta);
    // let wiPhi = stepX * (f32(i) + rands.y);
    // var wi = normalize(vec3(
    //   sin(wiPhi) * sin(wiTheta),
    //   cos(wiPhi) * sin(wiTheta),
    //   wiCosTheta,
    // ));

    let material = DIELECTRIC(vec3f(0.0), ax, ay, eta, 0, vec2f(0), vec2f(0), vec2i(0), vec2i(0), vec2i(0));

    var wi = vec3f(0);
    var brdf: vec3f;
    var pdf: f32;
    Dielectric_Sample_f(wo, material, rands, &wi, &pdf, &brdf);
    // TS_Sample_f(wo, rands.xy, ax, ay, vec3f(1.0), &wi, &pdf, &brdf);

    // // pdf = 1.0;
    // pdf = Dielectric_PDF(wo, wi, material);
    // brdf = Dielectric_f(wo, wi, material);
    // // let pdf2 = Dielectric_PDF(wo, wi, material);


    // let ifl = (1.0 - (dot(wi, wg) * 0.5 + 0.5)) * 16.0;
    // let ifl = (rands.z) * 16.0;
    let ifl = (0.75) * 16.0;
    var mswi = (ifl / 16) * -2 + 1;
    // let ifl = (0.0 - (dot(wi, wg) * 0.5 + 0.5)) * 16.0;
    let i0 = u32(ifl);
    var id = ifl - f32(i0);
    var i1: u32 = 0;

    if (ifl >= 15.5) {
      i1 = i0;
      id = 0.0;
      // i1 = i0 - 1;
      // id = 15.5 - ifl;
    } else if (ifl <= 0.5) {
      i1 = i0;
      id = 0;
      // i1 = i0 + 1;
      // id = -0.5 + ifl;
    } else if (id <= 0.5) {
      i1 = i0 - 1;
      id = 0.5 - id;
    } else if (id > 0.5) {
      i1 = i0 + 1;
      id = id - 0.5;
    }
    id = 0.0;

    let ESS_eta_wi0 = textureLoad(ESSlut, vec3u(tx, i0, tz), 0).x;
    let ESS_etai_wi0 = textureLoad(ESSIlut, vec3u(tx, i0, tz), 0).x;
    let ESS_eta_wi1 = textureLoad(ESSlut, vec3u(tx, i1, tz), 0).x;
    let ESS_etai_wi1 = textureLoad(ESSIlut, vec3u(tx, i1, tz), 0).x;

    let ESS_eta_wi = mix(ESS_eta_wi0, ESS_eta_wi1, id);
    let ESS_etai_wi = mix(ESS_etai_wi0, ESS_etai_wi1, id);


    // let fmsr = Favg * (1.0 - ESS_eta_wo) * (1.0 - ESS_eta_wi) / (PI * (1.0 - Eavg));
    // let fmst = (1.0 - Favg) * (1.0 - ESS_eta_wo) * (1.0 - ESS_etai_wi) / (PI * (1.0 - EavgI));
    let a = (1.0 - Favg) / (1.0 - EavgI);
    let b = (1.0 - FavgI) / (1.0 - Eavg) * (eta) * (eta);
    let x = b / (a + b);
    // let fmsr = x * (1.0 - ESS_eta_wo) * (1.0 - ESS_eta_wi) / (PI * (1.0 - Eavg));
    // let fmst = (1.0 - x) * (1.0 - ESS_eta_wo) * (1.0 - ESS_etai_wi) / (PI * (1.0 - EavgI));
    let fmsr = (Favg) * (1.0 - ESS_eta_wo) * (1.0 - ESS_eta_wi) / (PI * (1.0 - Eavg));
    let fmst = x * (1.0 - Favg) * (1.0 - ESS_eta_wo) * (1.0 - ESS_etai_wi) / (PI * (1.0 - EavgI));
    
    // let fmsr = FavgI * (1.0 - ESS_etai_wo) * (1.0 - ESS_etai_wi) / (PI * (1.0 - EavgI));
    // let fmst = (1.0 - FavgI) * (1.0 - ESS_etai_wo) * (1.0 - ESS_eta_wi) / (PI * (1.0 - Eavg));
    // let a = (1.0 - Favg) / (1.0 - EavgI);
    // let b = (1.0 - FavgI) / (1.0 - Eavg) * eta * eta;
    // let x = 1 - b / (a + b);  // notice the 1 - (x)

    // let msBrdf = 0.5 * x * vec3f(fmsr + fmst);
    let msBrdf = 0.5 * vec3f(fmsr + fmst);
    // let msBrdf = 0.5 * vec3f(fmst);
    let msPdf = 1 / (4.0 * PI);


    
    let fmsr2 = (Favg) * (1.0 - ESS_eta_wi) * (1.0 - ESS_eta_wo) / (PI * (1.0 - Eavg));
    // in questo caso voglio la f(wi,wo), e siccome NON HO CAMBIATO LE DIREZIONI, wi è *dentro*,
    // ed essendo dentro devo aggiustare tutte le variabili, come farei se volessi f(wo,wi) e
    // wo fosse "dentro"
    let fmst2 = (1-x) * (1.0 - FavgI) * (1.0 - ESS_etai_wi) * (1.0 - ESS_eta_wo) / (PI * (1.0 - Eavg));
    // let fmst2 = x * (1.0 - Favg) * (1.0 - ESS_eta_wi) * (1.0 - ESS_etai_wo) / (PI * (1.0 - EavgI));
    let msBrdf2 = 0.5 * vec3f(fmsr2 + fmst2);
    let msPdf2 = 1 / (4.0 * PI);



    // let msBrdf = 0.5 * vec3f((1.0 - ESS_eta_wo) * (1.0 - ESS_eta_wi) / (PI * (1.0 - Eavg)));
    // let msPdf = 1 / (4.0 * PI);


    if ((isFloatNaN(pdf) || pdf == 0.0)) {
      // pdf = 1.0;
      // brdf = vec3f(0.0);
      // invalidSamplesCount += 1;
    }

    // let sample = (brdf.x / pdf) * abs(dot(wi, wg));
    // let sample = (brdf.x / pdf) * abs(dot(wi, wg)) + (msBrdf.x / msPdf) * abs(mswi); // <-- which is basically: abs(dot(mswi, wg));
    // let sample = (msBrdf.x / msPdf) * abs(mswi); // <-- which is basically: abs(dot(mswi, wg));
    let sample = (ESS_eta_wo); // <-- which is basically: abs(dot(mswi, wg));
    integral += sample;
    // integral += sample * stepX * stepY;
    
    // integral = wi.z;
    // if (j > 15) {
      // break;
    // }
  }
  // break;
  // }

  integral /= f32(samples);
  // integral = f32(invalidSamplesCount);

  return integral;
}

@compute @workgroup_size(8, 8, 1) fn compute(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  if (gid.x >= LUTSize.x || gid.y >= LUTSize.y || gid.z >= LUTSize.z) { return; }
  let idx = gid.z * (LUTSize.x * LUTSize.y) + gid.y * (LUTSize.x) + gid.x;

  let samples: u32 = 50000;

  LUTOutput[idx] += integrateDielectricE_withImportance(samples, gid.xyz);
}
`;
