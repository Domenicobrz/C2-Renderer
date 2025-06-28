import { Color, Vector2 } from 'three';
import { MATERIAL_TYPE, Material } from './material';
import { intBitsToFloat } from '$lib/utils/intBitsToFloat';

export class Diffuse extends Material {
  private color: Color;
  private bumpStrength: number;
  private uvRepeat: Vector2;
  private mapUvRepeat: Vector2;
  private roughness: number;

  constructor({
    color,
    map,
    bumpMap,
    bumpStrength = 1,
    uvRepeat = new Vector2(1, 1),
    mapUvRepeat = new Vector2(1, 1),
    flipTextureY = false,
    roughness = 0
  }: {
    color: Color;
    map?: HTMLImageElement;
    bumpMap?: HTMLImageElement;
    bumpStrength?: number;
    uvRepeat?: Vector2;
    mapUvRepeat?: Vector2;
    flipTextureY?: boolean;
    roughness?: number;
  }) {
    super({ flipTextureY });
    this.type = MATERIAL_TYPE.DIFFUSE;
    this.color = color;
    this.bumpStrength = bumpStrength;
    this.uvRepeat = uvRepeat;
    this.mapUvRepeat = mapUvRepeat;
    this.offsetCount = 14;
    this.roughness = roughness;

    this.texturesLocation.map = new Vector2(-1, -1);
    this.texturesLocation.bumpMap = new Vector2(-1, -1);
    if (map) {
      this.textures.map = map;
    }
    if (bumpMap) {
      this.textures.bumpMap = bumpMap;
    }
  }

  getFloatsArray(): number[] {
    return [
      this.type,
      this.color.r,
      this.color.g,
      this.color.b,
      this.roughness,
      this.bumpStrength,
      this.uvRepeat.x,
      this.uvRepeat.y,
      this.mapUvRepeat.x,
      this.mapUvRepeat.y,
      // we'll store integers as floats and then bitcast them back into ints
      intBitsToFloat(this.texturesLocation.map.x),
      intBitsToFloat(this.texturesLocation.map.y),
      intBitsToFloat(this.texturesLocation.bumpMap.x),
      intBitsToFloat(this.texturesLocation.bumpMap.y)
    ];
  }

  static simpleLambertianDiffuse = /* wgsl */ `
fn getDiffuseMaterial(interpolatedAttributes: InterpolatedAttributes, offset: u32) -> EvaluatedMaterial {
  var data = EvaluatedMaterial();
  
  // material type
  data.materialType = u32(materialsBuffer[offset]);

  // color
  data.baseColor.x = materialsBuffer[offset + 1];
  data.baseColor.y = materialsBuffer[offset + 2];
  data.baseColor.z = materialsBuffer[offset + 3];

  data.roughness = materialsBuffer[offset + 4];
  
  // bumpStrength
  data.bumpStrength = materialsBuffer[offset + 5];

  // uv repeat x,y
  data.uvRepeat.x = materialsBuffer[offset + 6];
  data.uvRepeat.y = materialsBuffer[offset + 7];

  // map-uv repeat x,y
  data.mapUvRepeat.x = materialsBuffer[offset + 8];
  data.mapUvRepeat.y = materialsBuffer[offset + 9];
  
  // mapLocation    requires bitcast<i32>(...);
  data.mapLocation.x = bitcast<i32>(materialsBuffer[offset + 10]);
  data.mapLocation.y = bitcast<i32>(materialsBuffer[offset + 11]);
  
  // bumpMapLocation    requires bitcast<i32>(...);
  data.bumpMapLocation.x = bitcast<i32>(materialsBuffer[offset + 12]);
  data.bumpMapLocation.y = bitcast<i32>(materialsBuffer[offset + 13]);

  data.roughnessMapLocation = vec2i(-1, -1);

  if (data.mapLocation.x > -1) {
    let texelColor = getTexelFromTextureArrays(
      data.mapLocation, interpolatedAttributes.uv, data.mapUvRepeat
    ).xyz;

    data.baseColor *= texelColor;
  }

  return data;
}

fn evaluatePdfDiffuseLobe(
  wo: vec3f,
  wi: vec3f,
  material: EvaluatedMaterial, 
  surfaceNormals: SurfaceNormals,
) -> f32 {
  // assuming wi is in local-space
  let cosTheta = wi.z;
  let brdfSamplePdf = cosTheta / PI;
  return brdfSamplePdf;
}

fn evaluateDiffuseBrdf(
  wo: vec3f,
  wi: vec3f,
  material: EvaluatedMaterial, 
) -> vec3f {
  var color = material.baseColor;
  let brdf = color / PI;
  return brdf;
}

fn sampleDiffuseBrdf(
  material: EvaluatedMaterial, 
  geometryContext: GeometryContext
) -> BrdfDirectionSample {
  let ray = geometryContext.ray;
  let surfaceNormals = geometryContext.normals;

  // uniform hemisphere sampling:
  // let rand_1 = rands.x;
  // let rand_2 = rands.y;
  // let phi = 2.0 * PI * rand_1;
  // let root = sqrt(1 - rand_2 * rand_2);
  // // local space new ray direction
  // let newDir = vec3f(cos(phi) * root, rand_2, sin(phi) * root);
  // var brdfSamplePdf = 1 / (2 * PI);
  
  // *********************************************************************
  // if you switch to another brdf pdf, remember to also update the light sample brdf's pdf
  // *********************************************************************
  // cosine-weighted hemisphere sampling:
  let rands = vec4f(getRand2D(), getRand2D());
  let rand_1 = rands.x;
  // if rand_2 is 0, both cosTheta and the pdf will be zero
  let rand_2 = max(rands.y, 0.000001);
  let phi = 2.0 * PI * rand_1;
  let theta = acos(sqrt(rand_2));
  let cosTheta = cos(theta);
  let sinTheta = sin(theta);
  // local space new ray direction. Z points up to follow pbrt's convention
  let newDir = vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  var tangent = vec3f(0.0);
  var bitangent = vec3f(0.0);
  getTangentFromTriangle(geometryContext, &tangent, &bitangent);

  // https://learnopengl.com/Advanced-Lighting/Normal-Mapping
  let TBN = mat3x3f(tangent, bitangent, surfaceNormals.shading);

  // from tangent space to world space
  let newDirection = normalize(TBN * newDir);

  let brdf = evaluateDiffuseBrdf(vec3f(), vec3f(), material);
  var brdfSamplePdf = evaluatePdfDiffuseLobe(vec3f(), newDir, material, surfaceNormals);

  let lightSamplePdf = getLightPDF(Ray(ray.origin, newDirection));
  let misWeight = getMisWeight(brdfSamplePdf, lightSamplePdf);

  return BrdfDirectionSample(
    brdf,
    brdfSamplePdf,
    misWeight,
    newDirection,
  );
}

fn sampleDiffuseLight(
  material: EvaluatedMaterial, 
  geometryContext: GeometryContext
) -> LightDirectionSample {
  let ray = geometryContext.ray;
  let interpolatedAttributes = geometryContext.interpolatedAttributes;
  let surfaceNormals = geometryContext.normals;

  let rands = vec4f(getRand2D(), getRand2D());
  let lightSample = getLightSample(ray.origin, rands);
  let pdf = lightSample.pdf;
  let backSideHit = lightSample.backSideHit;

  let newDirection = lightSample.direction;

  // if the sampled ray sits below the hemisphere, brdfSamplePdf is zero,
  // since diffuse materials never sample a direction under the hemisphere.
  // However at this point, it doesn't even make sense to evaluate the 
  // rest of this function since we would be wasting a sample, thus we'll return
  // misWeight = 0 instead.
  if (
    dot(newDirection, surfaceNormals.shading) < 0.0 ||
    lightSample.pdf == 0.0
  ) {
    return LightDirectionSample(
      vec3f(0.0),
      1,
      0,
      vec3f(0.0),
      lightSample,
    );
  }

  let brdf = evaluateDiffuseBrdf(vec3f(), vec3f(), material);
  let simplifiedLocalSpaceDirection = vec3f(0.0, 0.0, dot(newDirection, surfaceNormals.shading));
  let brdfSamplePdf = evaluatePdfDiffuseLobe(vec3f(), simplifiedLocalSpaceDirection, material, surfaceNormals);
  let mis = getMisWeight(lightSample.pdf, brdfSamplePdf);

  return LightDirectionSample(
    brdf,
    pdf,
    mis,
    lightSample.direction,
    lightSample
  );
}
    `;

  static EONDiffuse = /* wgsl */ `
fn getDiffuseMaterial(interpolatedAttributes: InterpolatedAttributes, offset: u32) -> EvaluatedMaterial {
  var data = EvaluatedMaterial();
  
  // material type
  data.materialType = u32(materialsBuffer[offset]);

  // color
  data.baseColor.x = materialsBuffer[offset + 1];
  data.baseColor.y = materialsBuffer[offset + 2];
  data.baseColor.z = materialsBuffer[offset + 3];

  data.roughness = materialsBuffer[offset + 4];
  
  // bumpStrength
  data.bumpStrength = materialsBuffer[offset + 5];

  // uv repeat x,y
  data.uvRepeat.x = materialsBuffer[offset + 6];
  data.uvRepeat.y = materialsBuffer[offset + 7];

  // map-uv repeat x,y
  data.mapUvRepeat.x = materialsBuffer[offset + 8];
  data.mapUvRepeat.y = materialsBuffer[offset + 9];
  
  // mapLocation    requires bitcast<i32>(...);
  data.mapLocation.x = bitcast<i32>(materialsBuffer[offset + 10]);
  data.mapLocation.y = bitcast<i32>(materialsBuffer[offset + 11]);
  
  // bumpMapLocation    requires bitcast<i32>(...);
  data.bumpMapLocation.x = bitcast<i32>(materialsBuffer[offset + 12]);
  data.bumpMapLocation.y = bitcast<i32>(materialsBuffer[offset + 13]);

  data.roughnessMapLocation = vec2i(-1, -1);

  if (data.mapLocation.x > -1) {
    let texelColor = getTexelFromTextureArrays(
      data.mapLocation, interpolatedAttributes.uv, data.mapUvRepeat
    ).xyz;

    data.baseColor *= texelColor;
  }

  return data;
}

const constant1_FON: f32 = 0.5 - 2.0 / (3.0 * PI);
const constant2_FON: f32 = 2.0 / 3.0 - 28.0 / (15.0 * PI);

fn E_FON_exact(mu: f32, r: f32) -> f32 {
  let AF = 1.0 / (1.0 + constant1_FON * r); // FON A coeff.
  let BF = r * AF; // FON B coeff.
  let Si = sqrt(1.0 - (mu * mu));
  let G = Si * (acos(mu) - Si * mu) + 
    (2.0 / 3.0) * ((Si / mu) * (1.0 - (Si * Si * Si)) - Si);
  return AF + (BF/PI) * G;
}

fn E_FON_approx(mu: f32, r: f32) -> f32 {
  let mucomp = 1.0 - mu;
  let mucomp2 = mucomp * mucomp;
  let Gcoeffs = mat2x2f(0.0571085289, -0.332181442, 0.491881867, 0.0714429953);
  let GoverPi = dot(Gcoeffs * vec2f(mucomp, mucomp2), vec2f(1.0, mucomp2));
  return (1.0 + r * GoverPi) / (1.0 + constant1_FON * r);
}

// Evaluates EON BRDF value, given inputs:
//      rho = single-scattering albedo parameter
//        r = roughness in [0, 1]
// wi_local = direction of incident ray (directed away from vertex)
// wo_local = direction of outgoing ray (directed away from vertex)
//    exact = flag to select exact or fast approx. version
//
// Note that this implementation assumes throughout that the directions are
// specified in a local space where the z-direction aligns with the surface normal.
fn f_EON(rho: vec3f, r: f32, wi_local: vec3f, wo_local: vec3f, exact: bool) -> vec3f {
  let mu_i = wi_local.z; // input angle cos
  let mu_o = wo_local.z; // output angle cos
  let s = dot(wi_local, wo_local) - mu_i * mu_o; // QON s term
  
  // let sovertF = s > 0.0 ? s / max(mu_i, mu_o) : s; // FON s/t
  var sovertF = 0.0;
  if (s > 0.0) {
    sovertF = s / max(mu_i, mu_o);
  } else {
    sovertF = s;
  }
  
  let AF = 1.0 / (1.0 + constant1_FON * r); // FON A coeff.
  let f_ss = (rho / PI) * AF * (1.0 + r * sovertF); // single-scatter
  // float EFo = exact ? E_FON_exact(mu_o, r): // FON wo albedo (exact)
  // E_FON_approx(mu_o, r); // FON wo albedo (approx)
  var EFo = 0.0;
  if (exact) {
    EFo = E_FON_exact(mu_o, r);
  } else {
    EFo = E_FON_approx(mu_o, r);
  }
  
  // float EFi = exact ? E_FON_exact(mu_i, r): // FON wi albedo (exact)
    // E_FON_approx(mu_i, r); // FON wi albedo (approx)
  var EFi = 0.0;
  if (exact) {
    EFi = E_FON_exact(mu_i, r);
  } else {
    EFi = E_FON_approx(mu_i, r);
  }
  let avgEF = AF * (1.0 + constant2_FON * r); // avg. albedo
  let rho_ms = (rho * rho) * avgEF / (vec3f(1.0) - rho * (1.0 - avgEF));
  const eps = 1.0e-7;
  let f_ms = (rho_ms/PI) * max(eps, 1.0 - EFo) // multi-scatter lobe
    * max(eps, 1.0 - EFi)
    / max(eps, 1.0 - avgEF);
  return f_ss + f_ms;
}

fn orthonormal_basis_ltc(w: vec3f) -> mat3x3f {
  let lenSqr = dot(w.xy, w.xy);
  // let X = lenSqr > 0.0f ? vec3(w.x, w.y, 0.0f) * inversesqrt(lenSqr) : vec3(1, 0, 0);
  var X = vec3f(0.0);
  if (lenSqr > 0.0) {
    let inverseSquareRoot = 1.0 / sqrt(lenSqr);
    X = vec3f(w.x, w.y, 0.0) * inverseSquareRoot;
  } else {
    X = vec3f(1.0, 0.0, 0.0);
  }
  let Y = vec3f(-X.y, X.x, 0.0); // cross(Z, X)
  return mat3x3f(X, Y, vec3(0, 0, 1));
}

fn ltc_coeffs(
  mu: f32, r: f32,
  a: ptr<function, f32>, b: ptr<function, f32>, c: ptr<function, f32>, d: ptr<function, f32>
) {
  *a = 1.0 + r*(0.303392 + (-0.518982 + 0.111709*mu)*mu + (-0.276266 + 0.335918*mu)*r);
  *b = r*(-1.16407 + 1.15859*mu + (0.150815 - 0.150105*mu)*r)/(mu*mu*mu - 1.43545);
  *c = 1.0 + (0.20013 + (-0.506373 + 0.261777*mu)*mu)*r;
  *d = ((0.540852 + (-1.01625 + 0.475392*mu)*mu)*r)/(-1.0743 + mu*(0.0725628 + mu));
}

fn cltc_sample(wo_local: vec3f, r: f32, u1: f32, u2: f32) -> vec4f {
  var a: f32; var b: f32; var c: f32; var d: f32; 
  ltc_coeffs(wo_local.z, r, &a, &b, &c, &d); // coeffs of LTC M
  let R = sqrt(u1); 
  let phi = 2.0 * PI * u2; // CLTC sampling
  var x = R * cos(phi); 
  let y = R * sin(phi); // CLTC sampling
  let vz = 1.0 / sqrt(d*d + 1.0); // CLTC sampling factors
  let s = 0.5 * (1.0 + vz); // CLTC sampling factors
  x = -mix(sqrt(1.0 - y*y), x, s); // CLTC sampling
  let wh = vec3f(x, y, sqrt(max(1.0 - (x*x + y*y), 0.0))); // ωH sample via CLTC
  let pdf_wh = wh.z / (PI * s); // PDF of ωH sample
  var wi = vec3f(a*wh.x + b*wh.z, c*wh.y, d*wh.x + wh.z); // M ωH (unnormalized)
  let len = length(wi); // ∥M ωH∥ = 1/∥M−1 ωH∥
  let detM = c*(a - b*d); // |M|
  let pdf_wi = pdf_wh * len*len*len / detM; // ωi sample PDF
  let fromLTC = orthonormal_basis_ltc(wo_local); // ωi -> local space
  wi = normalize(fromLTC * wi); // ωi -> local space
  return vec4f(wi, pdf_wi);
}

fn cltc_pdf(wo_local: vec3f, wi_local: vec3f, r: f32) -> f32 {
  let toLTC = transpose(orthonormal_basis_ltc(wo_local)); // ωi -> LTC space
  let wi = toLTC * wi_local; // ωi -> LTC space
  var a: f32; var b: f32; var c: f32; var d: f32; 
  ltc_coeffs(wo_local.z, r, &a, &b, &c, &d); // coeffs of LTC M
  let detM = c*(a - b*d); // |M|
  let wh = vec3f(c*(wi.x - b*wi.z), (a - b*d)*wi.y, -c*(d*wi.x - a*wi.z)); // adj(M) ωi
  let lenSqr = dot(wh, wh);
  let vz = 1.0 / sqrt(d*d + 1.0); // CLTC sampling factors
  let s = 0.5 * (1.0 + vz); // CLTC sampling factors
  let pdf = detM*detM/(lenSqr*lenSqr) * max(wh.z, 0.0) / (PI * s); // wi sample PDF
  return pdf;
}

fn uniform_lobe_sample(u1: f32, u2: f32) -> vec3f {
  let sinTheta = sqrt(1.0 - u1*u1);
  let phi = 2.0 * PI * u2;
  return vec3f(sinTheta * cos(phi), sinTheta * sin(phi), u1);
}

fn sample_EON(wo_local: vec3f, r: f32, u1: f32, u2: f32) -> vec4f {
  let mu = wo_local.z;
  let P_u = pow(r, 0.1) * (0.162925 + mu*(-0.372058 + (0.538233 - 0.290822*mu)*mu));
  let P_c = 1.0 - P_u; // probability of CLTC sample
  var wi = vec4f(0.0); 
  var pdf_c = 0.0;
  if (u1 <= P_u) {
    let _u1 = u1 / P_u;
    wi = vec4f(uniform_lobe_sample(_u1, u2), 0.0); // sample wi from uniform lobe
    pdf_c = cltc_pdf(wo_local, wi.xyz, r); } // evaluate CLTC PDF at wi
  else {
    let _u1 = (u1 - P_u) / P_c;
    wi = cltc_sample(wo_local, r, _u1, u2); // sample wi from CLTC lobe
    pdf_c = wi.w; 
  }
 
  const pdf_u = 1.0 / (2.0 * PI);
  wi.w = P_u*pdf_u + P_c*pdf_c; // MIS PDF of wi
  
  return wi;
}

fn pdf_EON(wo_local: vec3f, wi_local: vec3f, r: f32) -> f32 {
  let mu = wo_local.z;
  let P_u = pow(r, 0.1) * (0.162925 + mu*(-0.372058 + (0.538233 - 0.290822*mu)*mu));
  let P_c = 1.0 - P_u;
  let pdf_c = cltc_pdf(wo_local, wi_local, r);
  const pdf_u = 1.0 / (2.0 * PI);
  return P_u*pdf_u + P_c*pdf_c;
}


fn evaluatePdfDiffuseLobe(
  wo: vec3f,
  wi: vec3f,
  material: EvaluatedMaterial, 
  surfaceNormals: SurfaceNormals,
) -> f32 {
  // assuming wi is in local-space
  return pdf_EON(wo, wi, material.roughness);
}

fn evaluateDiffuseBrdf(
  wo: vec3f,
  wi: vec3f,
  material: EvaluatedMaterial, 
) -> vec3f {
  // we're assuming wo and wi are in local-space 
  let brdf = f_EON(material.baseColor, material.roughness, wi, wo, true);
  return brdf;
}

fn sampleDiffuseBrdf(
  material: EvaluatedMaterial, 
  geometryContext: GeometryContext
) -> BrdfDirectionSample {
  let ray = geometryContext.ray;
  let surfaceNormals = geometryContext.normals;

  let rands = vec4f(getRand2D(), getRand2D());

  var tangent = vec3f(0.0);
  var bitangent = vec3f(0.0);
  getTangentFromTriangle(geometryContext, &tangent, &bitangent);
  
  // https://learnopengl.com/Advanced-Lighting/Normal-Mapping
  let TBN = mat3x3f(tangent, bitangent, surfaceNormals.shading);
  // to transform vectors from world space to tangent space, we multiply by
  // the inverse of the TBN
  let TBNinverse = transpose(TBN);
  let wo = TBNinverse * -ray.direction;
  
  // CLTC sampling
  let sample = sample_EON(wo, material.roughness, rands.x, rands.y);
  
  var wi = sample.xyz;
  let brdfSamplePdf = sample.w;

  let brdf = f_EON(material.baseColor, material.roughness, wi, wo, true);
  let newDirection = normalize(TBN * wi);

  let lightSamplePdf = getLightPDF(Ray(ray.origin, newDirection));
  let misWeight = getMisWeight(brdfSamplePdf, lightSamplePdf);

  return BrdfDirectionSample(
    brdf,
    brdfSamplePdf,
    misWeight,
    newDirection,
  );
}

fn sampleDiffuseLight(
  material: EvaluatedMaterial, 
  geometryContext: GeometryContext
) -> LightDirectionSample {
  let ray = geometryContext.ray;
  let surfaceNormals = geometryContext.normals;

  let rands = vec4f(getRand2D(), getRand2D());

  let lightSample = getLightSample(ray.origin, rands);
  let pdf = lightSample.pdf;
  let backSideHit = lightSample.backSideHit;

  var wo = -ray.direction;
  var wi = lightSample.direction;

  // from world-space to tangent-space
  transformToLocalSpace(&wo, &wi, geometryContext);

  let brdf = f_EON(material.baseColor, material.roughness, wi, wo, true);

  // cosine-weighted pdf
  // let cosTheta = dot(lightSample.direction, N);
  // var brdfSamplePdf = cosTheta / PI;
  
  // CLTC pdf
  var brdfSamplePdf = pdf_EON(wo, wi, material.roughness);

  // if the sampled ray sits below the hemisphere, brdfSamplePdf is zero,
  // since diffuse materials never sample a direction under the hemisphere.
  // However at this point, it doesn't even make sense to evaluate the 
  // rest of this function since we would be wasting a sample, thus we'll return
  // misWeight = 0 instead.
  if (
    brdfSamplePdf == 0.0 ||
    lightSample.pdf == 0.0
  ) {
    return LightDirectionSample(
      vec3f(0.0),
      1,
      0,
      vec3f(0.0),
      lightSample,
    );
  }

  let mis = getMisWeight(lightSample.pdf, brdfSamplePdf);

  return LightDirectionSample(
    brdf,
    pdf,
    mis,
    lightSample.direction,
    lightSample
  );
}
    `;

  static shaderDiffuseLobe(): string {
    // return Diffuse.simpleLambertianDiffuse;
    return Diffuse.EONDiffuse;
  }
}
