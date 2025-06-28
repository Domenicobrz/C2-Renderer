import { Vector2, type Color } from 'three';
import { MATERIAL_TYPE, Material } from './material';
import { intBitsToFloat } from '$lib/utils/intBitsToFloat';
import { clamp } from '$lib/utils/math';

// from: https://www.pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory
export class Dielectric extends Material {
  private absorption: Color;
  private roughness: number;
  private anisotropy: number;
  private eta: number;
  private bumpStrength: number;
  private uvRepeat: Vector2;
  private mapUvRepeat: Vector2;

  static MIN_INPUT_ROUGHNESS = 0.0707;

  constructor({
    absorption,
    roughness,
    anisotropy,
    eta,
    absorptionMap,
    roughnessMap,
    bumpMap,
    bumpStrength = 1,
    uvRepeat = new Vector2(1, 1),
    mapUvRepeat = new Vector2(1, 1),
    flipTextureY = false
  }: {
    absorption: Color;
    roughness: number;
    anisotropy: number;
    eta: number;
    absorptionMap?: HTMLImageElement;
    roughnessMap?: HTMLImageElement;
    bumpMap?: HTMLImageElement;
    bumpStrength?: number;
    uvRepeat?: Vector2;
    flipTextureY?: boolean;
    mapUvRepeat?: Vector2;
  }) {
    super({ flipTextureY });

    let minimumRoughness = Dielectric.MIN_INPUT_ROUGHNESS;

    this.type = MATERIAL_TYPE.DIELECTRIC;
    this.absorption = absorption;
    this.roughness = roughness * (1.0 - minimumRoughness) + minimumRoughness;
    this.anisotropy = clamp(anisotropy, 0.01, 0.99);
    this.eta = eta;
    if (eta < 1 || eta > 3) {
      this.eta = clamp(eta, 1, 3);
      console.error(
        "eta value can't be smaller than 1 or greater than 3, values for this material have been clamped"
      );
    }

    this.bumpStrength = bumpStrength;
    this.uvRepeat = uvRepeat;
    this.mapUvRepeat = mapUvRepeat;
    this.offsetCount = 18;

    this.texturesLocation.absorptionMap = new Vector2(-1, -1);
    this.texturesLocation.roughnessMap = new Vector2(-1, -1);
    this.texturesLocation.bumpMap = new Vector2(-1, -1);
    if (absorptionMap) {
      this.textures.absorptionMap = absorptionMap;
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
      this.absorption.r,
      this.absorption.g,
      this.absorption.b,
      this.roughness,
      this.anisotropy,
      this.eta,
      this.bumpStrength,
      this.uvRepeat.x,
      this.uvRepeat.y,
      this.mapUvRepeat.x,
      this.mapUvRepeat.y,
      // we'll store integers as floats and then bitcast them back into ints
      intBitsToFloat(this.texturesLocation.absorptionMap.x),
      intBitsToFloat(this.texturesLocation.absorptionMap.y),
      intBitsToFloat(this.texturesLocation.roughnessMap.x),
      intBitsToFloat(this.texturesLocation.roughnessMap.y),
      intBitsToFloat(this.texturesLocation.bumpMap.x),
      intBitsToFloat(this.texturesLocation.bumpMap.y)
    ];
  }

  // this division was created to simplify the shader of the multi-scatter LUT creation
  static shaderBRDF(): string {
    return /* wgsl */ `
    // assuming throwbridge reitz distribution methods are already defined ...
      // assuming throwbridge reitz distribution methods are already defined ...
      // assuming throwbridge reitz distribution methods are already defined ...
      fn FrDielectric(_cosTheta_i: f32, _eta: f32) -> f32 {
        var cosTheta_i = _cosTheta_i;
        var eta = _eta;
        
        cosTheta_i = clamp(cosTheta_i, -1, 1);
        if (cosTheta_i < 0) {
          eta = 1 / eta;
          cosTheta_i = -cosTheta_i;
        }
    
        let sin2Theta_i = 1 - Sqr(cosTheta_i);
        let sin2Theta_t = sin2Theta_i / Sqr(eta);
        if (sin2Theta_t >= 1) {
          return 1.0;
        }
        let cosTheta_t = sqrt(1 - sin2Theta_t);
    
        let r_parl = (eta * cosTheta_i - cosTheta_t) / (eta * cosTheta_i + cosTheta_t);
        let r_perp = (cosTheta_i - eta * cosTheta_t) / (cosTheta_i + eta * cosTheta_t);

        return (Sqr(r_parl) + Sqr(r_perp)) / 2;
      }

      fn Dielectric_PDF(wo: vec3f, wi: vec3f, eta: f32, ax: f32, ay: f32) -> f32 {
        if (eta == 1 || (ax < 0.0005 && ay < 0.0005)) {
          return 0;
        }

        // Evaluate sampling PDF of rough dielectric BSDF
        let cosTheta_o = CosTheta(wo);  
        let cosTheta_i = CosTheta(wi);
        let reflect: bool = cosTheta_i * cosTheta_o > 0;
        var etap = 1.0;
        if (!reflect) {
          if (cosTheta_o > 0) {
            etap = eta;
          } else {
            etap = (1.0 / eta);
          }
        }
        var wm = wi * etap + wo;
        if (cosTheta_i == 0 || cosTheta_o == 0 || LengthSquared(wm) == 0) {
          return 0;
        }
        wm = FaceForward(normalize(wm), vec3f(0, 0, 1));

        if (dot(wm, wi) * cosTheta_i < 0 || dot(wm, wo) * cosTheta_o < 0) {
          return 0;
        }

        let R = FrDielectric(dot(wo, wm), eta);
        let T = 1.0 - R;
        let pr = R;
        let pt = T;

        var pdf = 1.0;
        if (reflect) {
          pdf = TR_DistributionPDF(wo, wm, ax, ay) / (4.0 * AbsDot(wo, wm)) * pr / (pr + pt);
        } else {
          let denom = Sqr(dot(wi, wm) + dot(wo, wm) / etap);
          let dwm_dwi = AbsDot(wi, wm) / denom;
          pdf = TR_DistributionPDF(wo, wm, ax, ay) * dwm_dwi * pt / (pr + pt);
        }

        return pdf;
      }

      // this function samples the new wi direction, and returns the brdf and pdf
      fn Dielectric_Sample_f(
        wo:  vec3f,
        eta: f32,
        ax: f32,
        ay: f32,
        rands: vec4f,
        wi:  ptr<function, vec3f>,
        pdf: ptr<function, f32>,
        f:   ptr<function, vec3f>,
      ) {
        if (CosTheta(wo) == 0.0) {
          *wi = vec3f(0, 0, 1);
          *f = vec3f(0.0);
          *pdf = 1.0;
          return;
        }

        if (eta == 1.0 || (ax < 0.0005 && ay < 0.0005)) {
          // sample perfect specular BRDF

          let R = FrDielectric(CosTheta(wo), eta);
          let T = 1.0 - R;
          let pr = R;
          let pt = T;
          if (pr == 0 && pt == 0) {
            *f = vec3f(0.0);
            *pdf = 1.0;
            return;
          }

          let uc = rands.x;

          if (uc < pr / (pr + pt)) {
            *wi = vec3f(-wo.x, -wo.y, wo.z);
            *f = vec3f(R / AbsCosTheta(*wi));
            *pdf = pr / (pr + pt);
            return;
          } else {
            var etap = 0.0;
            let valid: bool = Refract(wo, vec3f(0, 0, 1), eta, &etap, wi);

            if (!valid) {
              *f = vec3f(0.0);
              *pdf = 1.0;
              return;
            }

            *f = vec3f(T / AbsCosTheta(*wi));
            // if (mode == TransportMode::Radiance) // it is ::Radiance in our implementation...
              *f /= Sqr(etap);
            // }

            *pdf = pt / (pr + pt);
          }
        } else {

          // sample rough dielectric BSDF

          let uc = rands.x;
          let u  = rands.yz;

          let wm = TS_Sample_wm(wo, u, ax, ay);
          let R = FrDielectric(dot(wo, wm), eta);
          let T = 1.0 - R;
          let pr = R;
          let pt = T;

          if (uc < pr / (pr + pt)) {
            *wi = Reflect(wo, wm);
            if (!SameHemisphere(wo, *wi)) {
              *f = vec3f(0.0);
              *pdf = 1.0;
              return;
            }
            *pdf = TR_DistributionPDF(wo, wm, ax, ay) / 
                      (4 * AbsDot(wo, wm)) * pr / (pr + pt);

            *f = vec3f(
              TR_D(wm, ax, ay) * 
              TR_G(wo, *wi, ax, ay) * R /
              (4 * CosTheta(*wi) * CosTheta(wo))
            );
          } else {
            var etap = 0.0;
            let tir = !Refract(wo, wm, eta, &etap, wi);
            if (SameHemisphere(wo, *wi) || (*wi).z == 0 || tir) {
              *f = vec3f(0.0);
              *pdf = 1.0;
              return;
            }

            let denom = Sqr(dot(*wi, wm) + dot(wo, wm) / etap);
            let dwm_dwi = AbsDot(*wi, wm) / denom;
            *pdf = TR_DistributionPDF(wo, wm, ax, ay) * dwm_dwi * pt / (pr + pt);

            *f = vec3f(T * TR_D(wm, ax, ay) *
              TR_G(wo, *wi, ax, ay) *
              abs(dot(*wi, wm) * dot(wo, wm) /
              (CosTheta(*wi) * CosTheta(wo) * denom))
            );

            // if (mode == TransportMode::Radiance) {
              *f /= Sqr(etap);
            //}
          }
        }

        if (*pdf <= 0.0) {
          *f = vec3f(0.0);
          *pdf = 1.0;
        }

        if(isFloatNaN((*f).x) || isFloatNaN((*f).y) || isFloatNaN((*f).z)) {
          *f = vec3f(0.0);
          *pdf = 1.0;
        }
      }

      fn Dielectric_f(wo: vec3f, wi: vec3f, eta: f32, ax: f32, ay: f32) -> vec3f {
        if (eta == 1.0 || (ax < 0.0005 && ay < 0.0005)) {
          // TODO: use correct dirac-delta values for perfect specular BRDF
          return vec3f(1.0);
        } else {

          let cosTheta_o = CosTheta(wo);
          let cosTheta_i = CosTheta(wi);
          let reflect: bool = cosTheta_i * cosTheta_o > 0;
          var etap = 1.0;
          if (!reflect) {
            if (cosTheta_o > 0) {
              etap = eta;
            } else {
              etap = (1.0 / eta);
            }
          }
          var wm = wi * etap + wo;
          if (cosTheta_i == 0 || cosTheta_o == 0 || LengthSquared(wm) == 0) {
            return vec3f(0.0);
          }
          wm = FaceForward(normalize(wm), vec3f(0, 0, 1));

          if (dot(wm, wi) * cosTheta_i < 0 || dot(wm, wo) * cosTheta_o < 0) {
            return vec3f(0.0);
          }

          let F = FrDielectric(dot(wo, wm), eta);
          if (reflect) {
            let fr = vec3f(
              TR_D(wm, ax, ay) * 
              TR_G(wo, wi, ax, ay) * F /
              abs(4.0 * cosTheta_i * cosTheta_o)
            );

            if (isFloatNaN(fr.x) || isFloatNaN(fr.y) || isFloatNaN(fr.z)) {
              return vec3f(0);
            }

            return fr;
          } else {
            let denom = Sqr(dot(wi, wm) + dot(wo, wm) / etap) * cosTheta_i * cosTheta_o;
            var ft = vec3f(
              TR_D(wm, ax, ay) * (1.0 - F) * 
              TR_G(wo, wi, ax, ay) *
              abs(dot(wi, wm) * dot(wo, wm) / denom)
            );

            //  if (mode == TransportMode::Radiance) {
              ft /= Sqr(etap);
            // }

            if (isFloatNaN(ft.x) || isFloatNaN(ft.y) || isFloatNaN(ft.z)) {
              return vec3f(0);
            }
            
            return vec3f(ft);
          }
        }
      }

      fn dielectricMultiScatteringFactor(wo: vec3f, roughness: f32, eta: f32) -> f32 {
        var msComp = 1.0;
        let woLutIndex = min(abs(wo.z), 0.9999);
        let roughLutIndex = min(roughness, 0.9999);
        let etaLutIndex = min(((eta - 1.0) / 2.0), 0.9999);
        if (wo.z > 0.0) {
          let uvt = vec3f(roughLutIndex, woLutIndex, etaLutIndex);
          msComp = getLUTvalue(uvt, LUT_MultiScatterDielectricEo).x;
        } else {
          let uvt = vec3f(roughLutIndex, woLutIndex, etaLutIndex);
          msComp = getLUTvalue(uvt, LUT_MultiScatterDielectricEoInverse).x;
        }

        return msComp;
      }
    `;
  }

  static shaderDielectricLobe(): string {
    return /* wgsl */ `
fn getDielectricMaterial(
  interpolatedAttributes: InterpolatedAttributes, offset: u32
) -> EvaluatedMaterial {
  var data = EvaluatedMaterial();
  
  // material type
  data.materialType = u32(materialsBuffer[offset + 0]);

  data.baseColor = vec3f(1.0);

  // absorption 
  data.absorptionCoefficient.x = materialsBuffer[offset + 1]; 
  data.absorptionCoefficient.y = materialsBuffer[offset + 2]; 
  data.absorptionCoefficient.z = materialsBuffer[offset + 3]; 

  data.emissiveIntensity = 0.0;

  // roughness, anisotropy
  data.roughness = materialsBuffer[offset + 4]; 
  data.anisotropy = materialsBuffer[offset + 5]; 

  // eta
  data.eta = materialsBuffer[offset + 6]; 

  // bump strength
  data.bumpStrength = materialsBuffer[offset + 7]; 

  data.uvRepeat = vec2f(
    materialsBuffer[offset + 8],
    materialsBuffer[offset + 9],
  );
  data.mapUvRepeat = vec2f(
    materialsBuffer[offset + 10],
    materialsBuffer[offset + 11],
  );

  data.mapLocation = vec2i(-1, -1);
  data.roughnessMapLocation = vec2i(
    bitcast<i32>(materialsBuffer[offset + 14]),
    bitcast<i32>(materialsBuffer[offset + 15]),
  );
  data.bumpMapLocation = vec2i(
    bitcast<i32>(materialsBuffer[offset + 16]),
    bitcast<i32>(materialsBuffer[offset + 17]),
  );

  if (data.roughnessMapLocation.x > -1) {
    let roughnessTexel = getTexelFromTextureArrays(
      data.roughnessMapLocation, interpolatedAttributes.uv, data.uvRepeat
    ).xy;

    // roughness
    data.roughness *= roughnessTexel.x;
    data.roughness = max(data.roughness, ${Dielectric.MIN_INPUT_ROUGHNESS});
  }

  let axay = anisotropyRemap(data.roughness, data.anisotropy);
  data.ax = axay.x;
  data.ay = axay.y;

  return data;
}

fn evaluatePdfDielectricLobe(
  wo: vec3f,
  wi: vec3f,
  material: EvaluatedMaterial, 
) -> f32 {
  let ax = material.ax;
  let ay = material.ay;
  let eta = material.eta;

  // we're assuming wo and wi are in local-space 
  var brdfSamplePdf = Dielectric_PDF(wo, wi, eta, ax, ay);
  return brdfSamplePdf;
}

fn evaluateDielectricBrdf(
  wo: vec3f,
  wi: vec3f,
  material: EvaluatedMaterial, 
) -> vec3f {
  let ax = material.ax;
  let ay = material.ay;
  let eta = material.eta;
  let roughness = material.roughness;

  // we're assuming wo and wi are in local-space 
  var brdf = Dielectric_f(wo, wi, eta, ax, ay);
  brdf /= dielectricMultiScatteringFactor(wo, roughness, eta);
  
  return brdf;
}

fn sampleDielectricBrdf(
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
  var wi = vec3f(0.0);

  let ax = material.ax;
  let ay = material.ay;
  let eta = material.eta;
  let roughness = material.roughness;

  var brdfSamplePdf = 0.0;
  var brdf = vec3f(0.0);
  Dielectric_Sample_f(wo, eta, ax, ay, rands, &wi, &brdfSamplePdf, &brdf);
  let msCompensation = dielectricMultiScatteringFactor(wo, roughness, eta);
  brdf /= msCompensation;
  
  let lightSamplePdf = getLightPDF(Ray(ray.origin, normalize(TBN * wi)));
  let misWeight = getMisWeight(brdfSamplePdf, lightSamplePdf);
  let newDirection = normalize(TBN * wi);

  return BrdfDirectionSample(
    brdf,
    brdfSamplePdf,
    misWeight,
    newDirection,
  );
}

fn sampleDielectricLight(
  material: EvaluatedMaterial, 
  geometryContext: GeometryContext
) -> LightDirectionSample {
  let ray = geometryContext.ray;
  let rands = vec4f(getRand2D(), getRand2D());

  let lightSample = getLightSample(ray.origin, rands);
  let pdf = lightSample.pdf;

  var wo = -ray.direction;
  var wi = lightSample.direction;

  // from world-space to tangent-space
  transformToLocalSpace(&wo, &wi, geometryContext);

  let ax = material.ax;
  let ay = material.ay;
  let eta = material.eta;
  let roughness = material.roughness;

  var brdfSamplePdf = Dielectric_PDF(wo, wi, eta, ax, ay);

  var brdf = Dielectric_f(wo, wi, eta, ax, ay);
  brdf /= dielectricMultiScatteringFactor(wo, roughness, eta);

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
