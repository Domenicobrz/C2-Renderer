import { Vector2, type Color } from 'three';
import { MATERIAL_TYPE, Material } from './material';
import { intBitsToFloat } from '$lib/utils/intBitsToFloat';
import { clamp } from '$lib/utils/math';

// from: https://www.pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory
export class TorranceSparrow extends Material {
  private color: Color;
  private roughness: number;
  private anisotropy: number;
  private bumpStrength: number;
  private uvRepeat: Vector2;
  private mapUvRepeat: Vector2;

  static MIN_INPUT_ROUGHNESS = 0.0707;

  constructor({
    color,
    roughness,
    anisotropy,
    map,
    roughnessMap,
    bumpMap,
    bumpStrength = 1,
    uvRepeat = new Vector2(1, 1),
    mapUvRepeat = new Vector2(1, 1),
    flipTextureY = false
  }: {
    color: Color;
    roughness: number;
    anisotropy: number;
    map?: HTMLImageElement;
    roughnessMap?: HTMLImageElement;
    bumpMap?: HTMLImageElement;
    bumpStrength?: number;
    uvRepeat?: Vector2;
    mapUvRepeat?: Vector2;
    flipTextureY?: boolean;
  }) {
    super({ flipTextureY });

    let minimumRoughness = TorranceSparrow.MIN_INPUT_ROUGHNESS;

    this.type = MATERIAL_TYPE.TORRANCE_SPARROW;
    this.color = color;
    // roughness will be squared while doing the ax,ay remapping
    // thus setting 0.0707 as the minimum will result in 0.005 being the
    // real minimum roughness. Lower than that I start to risk floating point
    // precision errors.
    // if I ever need to go lower, I'll have to start using the mirror/delta function
    // adjustments
    this.roughness = roughness * (1.0 - minimumRoughness) + minimumRoughness;
    this.anisotropy = clamp(anisotropy, 0.01, 0.99);
    this.bumpStrength = bumpStrength;
    this.uvRepeat = uvRepeat;
    this.mapUvRepeat = mapUvRepeat;
    this.offsetCount = 17;

    this.texturesLocation.map = new Vector2(-1, -1);
    this.texturesLocation.roughnessMap = new Vector2(-1, -1);
    this.texturesLocation.bumpMap = new Vector2(-1, -1);
    if (map) {
      this.textures.map = map;
    }
    if (roughnessMap) {
      this.textures.roughnessMap = roughnessMap;
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
      this.anisotropy,
      this.bumpStrength,
      this.uvRepeat.x,
      this.uvRepeat.y,
      this.mapUvRepeat.x,
      this.mapUvRepeat.y,
      // we'll store integers as floats and then bitcast them back into ints
      intBitsToFloat(this.texturesLocation.map.x),
      intBitsToFloat(this.texturesLocation.map.y),
      intBitsToFloat(this.texturesLocation.roughnessMap.x),
      intBitsToFloat(this.texturesLocation.roughnessMap.y),
      intBitsToFloat(this.texturesLocation.bumpMap.x),
      intBitsToFloat(this.texturesLocation.bumpMap.y)
    ];
  }

  // this division was created to simplify the shader of the multi-scatter LUT creation
  static shaderBRDF(): string {
    return /* wgsl */ `
    // throwbridge reitz distribution
    fn TR_D(wm: vec3f, alpha_x: f32, alpha_y: f32) -> f32 {
      let tan2Theta = Tan2Theta(wm);
      if (IsInf(tan2Theta)) {
        return 0;
      }

      let cos4Theta = Sqr(Cos2Theta(wm));
      let e = tan2Theta * (Sqr(CosPhi(wm) / alpha_x) +
                             Sqr(SinPhi(wm) / alpha_y));
      return 1 / (PI * alpha_x * alpha_y * cos4Theta * Sqr(1 + e));
    }
    fn TR_Lambda(w: vec3f, alpha_x: f32, alpha_y: f32) -> f32 {
      let tan2Theta = Tan2Theta(w);
      if (IsInf(tan2Theta)) {
        return 0;
      }
      let alpha2 = Sqr(CosPhi(w) * alpha_x) + Sqr(SinPhi(w) * alpha_y);
      return (sqrt(1 + alpha2 * tan2Theta) - 1) / 2;
    }
    fn TR_G1(w: vec3f, alpha_x: f32, alpha_y: f32) -> f32 { 
      return 1 / (1 + TR_Lambda(w, alpha_x, alpha_y)); 
    }
    fn TR_G(wo: vec3f, wi: vec3f, alpha_x: f32, alpha_y: f32) -> f32 {
      return 1 / (1 + TR_Lambda(wo, alpha_x, alpha_y) + TR_Lambda(wi, alpha_x, alpha_y));
    }
    // overloading will be supported in the future, so for now it's D2...
    // https://github.com/gpuweb/gpuweb/issues/4507#issuecomment-1989674670
    fn TR_D2(w: vec3f, wm: vec3f, alpha_x: f32, alpha_y: f32) -> f32 {
      return TR_G1(w, alpha_x, alpha_y) / AbsCosTheta(w) * TR_D(wm, alpha_x, alpha_y) * AbsDot(w, wm);
    }
    fn TR_DistributionPDF(w: vec3f, wm: vec3f, alpha_x: f32, alpha_y: f32) -> f32 { 
      return TR_D2(w, wm, alpha_x, alpha_y); 
    }
    fn TS_Sample_wm(w: vec3f, u: vec2f, alpha_x: f32, alpha_y: f32) -> vec3f {
      var wh = normalize(vec3f(alpha_x * w.x, alpha_y * w.y, w.z));
      if (wh.z < 0) {
        wh = -wh;
      }
      var T1 = vec3f(0,0,0);
      if (wh.z < 0.99999f) {
        T1 = normalize(cross(vec3f(0, 0, 1), wh));
      } else {
        T1 = vec3f(1, 0, 0);
      }
      let T2 = cross(wh, T1);
      var p: vec2f = SampleUniformDiskPolar(u);
      let h = sqrt(1 - Sqr(p.x));
      p.y = Lerp((1 + wh.z) / 2, h, p.y);
      let pz = sqrt(max(0, 1 - LengthSquaredV2(vec2f(p))));
      let nh = p.x * T1 + p.y * T2 + pz * wh;
      return normalize(vec3f(alpha_x * nh.x, alpha_y * nh.y, max(1e-6, nh.z)));
    }
    fn TS_PDF(wo: vec3f, wi: vec3f, alpha_x: f32, alpha_y: f32) -> f32 {
      if (!SameHemisphere(wo, wi) || CosTheta(wo) == 0) {
        return 0;
      }
      var wm = wo + wi;
      if (LengthSquared(wm) == 0) {
        return 0;
      }
      wm = FaceForward(normalize(wm), vec3f(0, 0, 1)); 
      return TR_DistributionPDF(wo, wm, alpha_x, alpha_y) / (4 * AbsDot(wo, wm));
    }
    // this function samples the new wi direction, and returns the brdf and pdf
    fn TS_Sample_f(
      wo:  vec3f, u: vec2f, alpha_x: f32, alpha_y: f32, 
      color: vec3f,
      wi:  ptr<function, vec3f>,
      pdf: ptr<function, f32>,
      f:   ptr<function, vec3f>,
    ) {
      let wm = TS_Sample_wm(wo, u, alpha_x, alpha_y);
      // reflect from wgsl needs the wo vector to point "inside" the surface
      // whereas the implementation in pbrt v4 has wo pointing to the camera 
      *wi = reflect(-wo, wm);

      if (!SameHemisphere(wo, *wi) || CosTheta(wo) == 0) {
        *f = vec3f(0.0);
        *pdf = 1.0;
        return;
      }

      *pdf = TS_PDF(wo, *wi, alpha_x, alpha_y);
    
      let cosTheta_o = AbsCosTheta(wo);
      let cosTheta_i = AbsCosTheta(*wi);

      let F = SchlickFresnel(color, dot(*wi, wm));

      *f = TR_D(wm, alpha_x, alpha_y) * F * TR_G(wo, *wi, alpha_x, alpha_y) /
                          (4 * cosTheta_i * cosTheta_o);

      /*
      TODO:
        Incident and outgoing directions at glancing angles need to be handled explicitly to avoid the generation of NaN values:

        <<Compute cosines and  for conductor BRDF>>= 
          Float cosTheta_o = AbsCosTheta(wo), cosTheta_i = AbsCosTheta(wi);
          if (cosTheta_i == 0 || cosTheta_o == 0) return {};
          Vector3f wm = wi + wo;
          if (LengthSquared(wm) == 0) return {};
          wm = Normalize(wm);
      */

      if (*pdf <= 0.0) {
        *f = vec3f(0.0);
        *pdf = 1.0;
      }

      // brdf values might be NaN, without this check on a cornell box scene with diffuse walls
      // and a glossy sphere at the center, after around 1500 samples with ax & ay set to 0.25
      // I'll start seeing black / broken pixels
      if(isFloatNaN((*f).x) || isFloatNaN((*f).y) || isFloatNaN((*f).z)) {
        *f = vec3f(0.0);
        *pdf = 1.0;
      }
    }

    fn TS_f(wo: vec3f, wi: vec3f, alpha_x: f32, alpha_y: f32, color: vec3f) -> vec3f {
      if (!SameHemisphere(wo, wi)) {
        return vec3f(0);
      }

      let cosTheta_o = AbsCosTheta(wo);
      let cosTheta_i = AbsCosTheta(wi);
      if (cosTheta_i == 0 || cosTheta_o == 0) {
        return vec3f(0);
      }
      var wm = wi + wo;
      if (LengthSquared(wm) == 0) {
        return vec3f(0);
      }
      wm = normalize(wm);

      let F = SchlickFresnel(color, dot(wi, wm));

      var f = TR_D(wm, alpha_x, alpha_y) * F * TR_G(wo, wi, alpha_x, alpha_y) /
        (4 * cosTheta_i * cosTheta_o);

      if (isFloatNaN(f.x) || isFloatNaN(f.y) || isFloatNaN(f.z)) {
        return vec3f(0);
      }
      
      return f;
    }

    // https://blog.selfshadow.com/publications/turquin/ms_comp_final.pdf
    fn multiScatterCompensationTorranceSparrow(F0: vec3f, wo: vec3f, roughness: f32) -> vec3f {
      let ESSwo = getLUTvalue(
        vec3f(roughness, saturate(wo.z /* dot(wo, norm) */), 0),
        LUT_MultiScatterTorranceSparrow, 
      ).x;
  
      let multiScatteringCoefficient = (1.0 + F0 * (1.0 - ESSwo) / ESSwo);
      return multiScatteringCoefficient;
    }
  `;
  }

  static shaderTorranceSparrowLobe(): string {
    return /* wgsl */ `
fn getTSMaterial(
  surfaceAttributes: SurfaceAttributes, offset: u32
) -> EvaluatedMaterial {
  var data = EvaluatedMaterial();
  
  // material type
  data.materialType = u32(materialsBuffer[offset + 0]);

  // color 
  data.baseColor.x = materialsBuffer[offset + 1]; 
  data.baseColor.y = materialsBuffer[offset + 2]; 
  data.baseColor.z = materialsBuffer[offset + 3]; 

  // bump strength
  data.bumpStrength = materialsBuffer[offset + 6]; 

  // uvRepeat, used for bumpMapping
  data.uvRepeat.x = materialsBuffer[offset + 7];
  data.uvRepeat.y = materialsBuffer[offset + 8];

  // bumpMapLocation, used for bumpMapping
  data.bumpMapLocation.x = bitcast<i32>(materialsBuffer[offset + 15]);
  data.bumpMapLocation.y = bitcast<i32>(materialsBuffer[offset + 16]);

  // roughness, anisotropy
  data.roughness = materialsBuffer[offset + 4]; 
  data.anisotropy = materialsBuffer[offset + 5]; 

  data.uvRepeat = vec2f(
    materialsBuffer[offset + 7],
    materialsBuffer[offset + 8],
  );
  data.mapUvRepeat = vec2f(
    materialsBuffer[offset + 9],
    materialsBuffer[offset + 10],
  );

  data.mapLocation = vec2i(
    bitcast<i32>(materialsBuffer[offset + 11]),
    bitcast<i32>(materialsBuffer[offset + 12]),
  );
  data.roughnessMapLocation = vec2i(
    bitcast<i32>(materialsBuffer[offset + 13]),
    bitcast<i32>(materialsBuffer[offset + 14]),
  );
  data.bumpMapLocation = vec2i(
    bitcast<i32>(materialsBuffer[offset + 15]),
    bitcast<i32>(materialsBuffer[offset + 16]),
  );

  if (data.mapLocation.x > -1) {
    let texelColor = getTexelFromTextureArrays(
      data.mapLocation, surfaceAttributes.uv, data.mapUvRepeat
    ).xyz;

    // color
    data.baseColor *= texelColor;
  }
  if (data.roughnessMapLocation.x > -1) {
    let roughnessTexel = getTexelFromTextureArrays(
      data.roughnessMapLocation, surfaceAttributes.uv, data.uvRepeat
    ).xy;

    // roughness
    data.roughness *= roughnessTexel.x;
    data.roughness = max(data.roughness, ${TorranceSparrow.MIN_INPUT_ROUGHNESS});
  }

  let axay = anisotropyRemap(data.roughness, data.anisotropy);
  data.ax = axay.x;
  data.ay = axay.y;

  return data;
}

fn evaluatePdfTSLobe(
  wo: vec3f,
  wi: vec3f,
  material: EvaluatedMaterial, 
) -> f32 {
  let ax = material.ax;
  let ay = material.ay;

  // we're assuming wo and wi are in local-space 
  var brdfSamplePdf = TS_PDF(wo, wi, ax, ay);

  return brdfSamplePdf;
}

fn evaluateTSBrdf(
  wo: vec3f,
  wi: vec3f,
  material: EvaluatedMaterial, 
) -> vec3f {
  let color = material.baseColor;
  let ax = material.ax;
  let ay = material.ay;
  let roughness = material.roughness;

  // we're assuming wo and wi are in local-space 
  var brdf = TS_f(wo, wi, ax, ay, color);
  brdf *= multiScatterCompensationTorranceSparrow(color, wo, roughness);
  
  return brdf;
}

fn sampleTSBrdf(
  material: EvaluatedMaterial, 
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> BrdfDirectionSample {
  let rands = vec4f(getRand2D(), getRand2D());

  var tangent = vec3f(0.0);
  var bitangent = vec3f(0.0);
  getTangentFromTriangle(
    surfaceAttributes.tangent, surfaceNormals.geometric, surfaceNormals.shading, 
    &tangent, &bitangent
  );
  
  // https://learnopengl.com/Advanced-Lighting/Normal-Mapping
  let TBN = mat3x3f(tangent, bitangent, surfaceNormals.shading);
  // to transform vectors from world space to tangent space, we multiply by
  // the inverse of the TBN
  let TBNinverse = transpose(TBN);
  let wo = TBNinverse * -(*ray).direction;
  var wi = vec3f(0.0);

  let color = material.baseColor;
  let ax = material.ax;
  let ay = material.ay;
  let roughness = material.roughness;

  var brdfSamplePdf = 0.0;
  var brdf = vec3f(0.0);
  TS_Sample_f(wo, rands.xy, ax, ay, color, &wi, &brdfSamplePdf, &brdf);
  brdf *= multiScatterCompensationTorranceSparrow(color, wo, roughness);
  
  let lightSamplePdf = getLightPDF(Ray((*ray).origin, normalize(TBN * wi)));
  let misWeight = getMisWeight(brdfSamplePdf, lightSamplePdf);
  let newDirection = normalize(TBN * wi);

  return BrdfDirectionSample(
    brdf,
    brdfSamplePdf,
    misWeight,
    newDirection,
  );
}

fn sampleTSLight(
  material: EvaluatedMaterial, 
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> LightDirectionSample {
  let rands = vec4f(getRand2D(), getRand2D());

  let lightSample = getLightSample(ray.origin, rands);
  let pdf = lightSample.pdf;
  let backSideHit = lightSample.backSideHit;

  var wo = -(*ray).direction;
  var wi = lightSample.direction;

  // from world-space to tangent-space
  transformToLocalSpace(&wo, &wi, surfaceAttributes, surfaceNormals);

  let color = material.baseColor;
  let ax = material.ax;
  let ay = material.ay;
  let roughness = material.roughness;

  var brdfSamplePdf = TS_PDF(wo, wi, ax, ay);
  var brdf = TS_f(wo, wi, ax, ay, color);
  brdf *= multiScatterCompensationTorranceSparrow(color, wo, roughness);

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
  }
}
