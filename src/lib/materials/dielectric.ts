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

  static shaderStruct(): string {
    return /* wgsl */ `
      struct DIELECTRIC {
        absorption: vec3f,
        ax: f32,
        ay: f32,
        roughness: f32,
        anisotropy: f32,
        eta: f32,
        bumpStrength: f32,
        uvRepeat: vec2f,
        mapUvRepeat: vec2f,
        absorptionMapLocation: vec2i,
        roughnessMapLocation: vec2i,
        bumpMapLocation: vec2i,
      }
    `;
  }

  static shaderCreateStruct(): string {
    return /* wgsl */ `
      fn createDielectric(offset: u32) -> DIELECTRIC {
        var d: DIELECTRIC;
        d.absorption = vec3f(
          materialsData[offset + 1],
          materialsData[offset + 2],
          materialsData[offset + 3],
        );
        d.ax = 0; // we'll map this value in the shader
        d.ay = 0; // we'll map this value in the shader
        d.roughness = materialsData[offset + 4];
        d.anisotropy = materialsData[offset + 5];
        d.eta = materialsData[offset + 6];
        d.bumpStrength = materialsData[offset + 7];
        d.uvRepeat.x = materialsData[offset + 8];
        d.uvRepeat.y = materialsData[offset + 9];
        d.mapUvRepeat.x = materialsData[offset + 10];
        d.mapUvRepeat.y = materialsData[offset + 11];
        d.absorptionMapLocation = vec2i(
          bitcast<i32>(materialsData[offset + 12]),
          bitcast<i32>(materialsData[offset + 13]),
        );
        d.roughnessMapLocation = vec2i(
          bitcast<i32>(materialsData[offset + 14]),
          bitcast<i32>(materialsData[offset + 15]),
        );
        d.bumpMapLocation = vec2i(
          bitcast<i32>(materialsData[offset + 16]),
          bitcast<i32>(materialsData[offset + 17]),
        );
        return d;
      } 
    `;
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

      fn Dielectric_PDF(wo: vec3f, wi: vec3f, material: DIELECTRIC) -> f32 {
        if (material.eta == 1 || (material.ax < 0.0005 && material.ay < 0.0005)) {
          return 0;
        }

        // Evaluate sampling PDF of rough dielectric BSDF
        let cosTheta_o = CosTheta(wo);  
        let cosTheta_i = CosTheta(wi);
        let reflect: bool = cosTheta_i * cosTheta_o > 0;
        var etap = 1.0;
        if (!reflect) {
          if (cosTheta_o > 0) {
            etap = material.eta;
          } else {
            etap = (1.0 / material.eta);
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

        let R = FrDielectric(dot(wo, wm), material.eta);
        let T = 1.0 - R;
        let pr = R;
        let pt = T;

        var pdf = 1.0;
        if (reflect) {
          pdf = TR_DistributionPDF(wo, wm, material.ax, material.ay) / (4.0 * AbsDot(wo, wm)) * pr / (pr + pt);
        } else {
          let denom = Sqr(dot(wi, wm) + dot(wo, wm) / etap);
          let dwm_dwi = AbsDot(wi, wm) / denom;
          pdf = TR_DistributionPDF(wo, wm, material.ax, material.ay) * dwm_dwi * pt / (pr + pt);
        }

        return pdf;
      }

      // this function samples the new wi direction, and returns the brdf and pdf
      fn Dielectric_Sample_f(
        wo:  vec3f,
        material: DIELECTRIC,
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

        if (material.eta == 1.0 || (material.ax < 0.0005 && material.ay < 0.0005)) {
          // sample perfect specular BRDF

          let R = FrDielectric(CosTheta(wo), material.eta);
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
            let valid: bool = Refract(wo, vec3f(0, 0, 1), material.eta, &etap, wi);

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

          let wm = TS_Sample_wm(wo, u, material.ax, material.ay);
          let R = FrDielectric(dot(wo, wm), material.eta);
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
            *pdf = TR_DistributionPDF(wo, wm, material.ax, material.ay) / 
                      (4 * AbsDot(wo, wm)) * pr / (pr + pt);

            *f = vec3f(
              TR_D(wm, material.ax, material.ay) * 
              TR_G(wo, *wi, material.ax, material.ay) * R /
              (4 * CosTheta(*wi) * CosTheta(wo))
            );
          } else {
            var etap = 0.0;
            let tir = !Refract(wo, wm, material.eta, &etap, wi);
            if (SameHemisphere(wo, *wi) || (*wi).z == 0 || tir) {
              *f = vec3f(0.0);
              *pdf = 1.0;
              return;
            }

            let denom = Sqr(dot(*wi, wm) + dot(wo, wm) / etap);
            let dwm_dwi = AbsDot(*wi, wm) / denom;
            *pdf = TR_DistributionPDF(wo, wm, material.ax, material.ay) * dwm_dwi * pt / (pr + pt);

            *f = vec3f(T * TR_D(wm, material.ax, material.ay) *
              TR_G(wo, *wi, material.ax, material.ay) *
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

      fn Dielectric_f(wo: vec3f, wi: vec3f, material: DIELECTRIC) -> vec3f {
        if (material.eta == 1.0 || (material.ax < 0.0005 && material.ay < 0.0005)) {
          // TODO: use correct dirac-delta values for perfect specular BRDF
          return vec3f(1.0);
        } else {

          let cosTheta_o = CosTheta(wo);
          let cosTheta_i = CosTheta(wi);
          let reflect: bool = cosTheta_i * cosTheta_o > 0;
          var etap = 1.0;
          if (!reflect) {
            if (cosTheta_o > 0) {
              etap = material.eta;
            } else {
              etap = (1.0 / material.eta);
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

          let F = FrDielectric(dot(wo, wm), material.eta);
          if (reflect) {
            let fr = vec3f(
              TR_D(wm, material.ax, material.ay) * 
              TR_G(wo, wi, material.ax, material.ay) * F /
              abs(4.0 * cosTheta_i * cosTheta_o)
            );

            if (isFloatNaN(fr.x) || isFloatNaN(fr.y) || isFloatNaN(fr.z)) {
              return vec3f(0);
            }

            return fr;
          } else {
            let denom = Sqr(dot(wi, wm) + dot(wo, wm) / etap) * cosTheta_i * cosTheta_o;
            var ft = vec3f(
              TR_D(wm, material.ax, material.ay) * (1.0 - F) * 
              TR_G(wo, wi, material.ax, material.ay) *
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
    `;
  }

  static shaderShadeDielectric(): string {
    return /* wgsl */ `
      fn shadeDielectricSampleBRDF(
        rands: vec4f, 
        material: DIELECTRIC,
        wo: vec3f,
        wi: ptr<function, vec3f>,
        worldSpaceRay: ptr<function, Ray>, 
        TBN: mat3x3f,
        brdf: ptr<function, vec3f>,
        pdf: ptr<function, f32>,
        misWeight: ptr<function, f32>,
      ) {
        Dielectric_Sample_f(wo, material, rands, wi, pdf, brdf);
        
        let newDir = normalize(TBN * *wi);
        let lightSamplePdf = getLightPDF(Ray((*worldSpaceRay).origin, newDir));
        *misWeight = getMisWeight(*pdf, lightSamplePdf);
      }

      fn shadeDielectricSampleLight(
        rands: vec4f, 
        material: DIELECTRIC,
        wo: vec3f,
        wi: ptr<function, vec3f>,
        worldSpaceRay: ptr<function, Ray>, 
        TBN: mat3x3f,
        TBNinverse: mat3x3f,
        brdf: ptr<function, vec3f>,
        pdf: ptr<function, f32>,
        misWeight: ptr<function, f32>,
        lightSampleRadiance: ptr<function, vec3f>,
      ) {
        let lightSample = getLightSample(worldSpaceRay.origin, rands);
        *pdf = lightSample.pdf;
        let backSideHit = lightSample.backSideHit;

        // from world-space to tangent-space
        *wi = TBNinverse * lightSample.direction;

        var brdfSamplePdf = Dielectric_PDF(wo, *wi, material);
        *brdf = Dielectric_f(wo, *wi, material);

        if (
          brdfSamplePdf == 0.0 ||
          lightSample.pdf == 0.0
        ) {
          *misWeight = 0; *pdf = 1; *brdf = vec3f(0.0);
          *lightSampleRadiance = vec3f(0.0);
          // this will avoid NaNs when we try to normalize wi
          *wi = vec3f(-1);
          return;
        }

        *lightSampleRadiance = lightSample.radiance;
        *misWeight = getMisWeight(lightSample.pdf, brdfSamplePdf);
      }

      fn dielectricMultiScatteringFactor(wo: vec3f, material: DIELECTRIC) -> f32 {
        var msComp = 1.0;
        let woLutIndex = min(abs(wo.z), 0.9999);
        let roughLutIndex = min(material.roughness, 0.9999);
        let etaLutIndex = min(((material.eta - 1.0) / 2.0), 0.9999);
        if (wo.z > 0.0) {
          let uvt = vec3f(roughLutIndex, woLutIndex, etaLutIndex);
          msComp = getLUTvalue(uvt, LUT_MultiScatterDielectricEo).x;
        } else {
          let uvt = vec3f(roughLutIndex, woLutIndex, etaLutIndex);
          msComp = getLUTvalue(uvt, LUT_MultiScatterDielectricEoInverse).x;
        }

        return msComp;
      }

      fn shadeDielectric(
        ires: BVHIntersectionResult, 
        ray: ptr<function, Ray>,
        reflectance: ptr<function, vec3f>, 
        rad: ptr<function, vec3f>,
        tid: vec3u,
        i: i32
      ) {
        let hitPoint = ires.hitPoint;
        var material: DIELECTRIC = createDielectric(ires.triangle.materialOffset);

        var absorption = material.absorption;
        // using a texture here is non-sensical from a PBR perspective,
        // however it can be desireable from an artistic point of view
        if (material.absorptionMapLocation.x > -1) {
          absorption *= getTexelFromTextureArrays(
            material.absorptionMapLocation, ires.uv, material.mapUvRepeat
          ).xyz;
        }

        if (material.roughnessMapLocation.x > -1) {
          let roughness = getTexelFromTextureArrays(
            material.roughnessMapLocation, ires.uv, material.uvRepeat
          ).xy;
          material.roughness *= roughness.x;
          material.roughness = max(material.roughness, ${Dielectric.MIN_INPUT_ROUGHNESS});
        }

        let axay = anisotropyRemap(material.roughness, material.anisotropy);
        material.ax = axay.x;
        material.ay = axay.y;

        var vertexNormal = ires.normal;
        var N = vertexNormal;
        var bumpOffset: f32 = 0.0;
        if (material.bumpMapLocation.x > -1) {
          N = getShadingNormal(
            material.bumpMapLocation, material.bumpStrength, material.uvRepeat, N, *ray, 
            ires, &bumpOffset
          );
        }

        var isInsideMedium = dot(N, (*ray).direction) > 0;
        
        // beer-lambert absorption 
        if (isInsideMedium) {
          *reflectance *= vec3f(
            exp(-absorption.x * ires.t), 
            exp(-absorption.y * ires.t), 
            exp(-absorption.z * ires.t), 
          );
        }
        
        // needs to be the exact origin, such that getLightSample/getLightPDF can apply a proper offset 
        (*ray).origin = ires.hitPoint;

        // rands1.w is used for ONE_SAMPLE_MODEL
        // rands1.xyz is used for brdf samples
        // rands2.xyz is used for light samples (getLightSample(...) uses .xyz)
        let rands1 = vec4f(getRand2D(), getRand2D());
        let rands2 = vec4f(getRand2D(), getRand2D());
        
        // we need to calculate a TBN matrix
        var tangent = vec3f(0.0);
        var bitangent = vec3f(0.0);
        getTangentFromTriangle(ires, ires.triangle, N, &tangent, &bitangent);
       

        // https://learnopengl.com/Advanced-Lighting/Normal-Mapping
        let TBN = mat3x3f(tangent, bitangent, N);
        // to transform vectors from world space to tangent space, we multiply by
        // the inverse of the TBN
        let TBNinverse = transpose(TBN);

        var wi = vec3f(0,0,0); 
        let wo = normalize(TBNinverse * -(*ray).direction);

        let msCompensation = dielectricMultiScatteringFactor(wo, material);

        if (config.MIS_TYPE == BRDF_ONLY) {
          var pdf: f32; var w: f32; var brdf: vec3f;
          shadeDielectricSampleBRDF(
            rands1, material, wo, &wi, ray, TBN, &brdf, &pdf, &w
          );

          (*ray).direction = normalize(TBN * wi);
          (*ray).origin = ires.hitPoint + (*ray).direction * 0.001;
          *reflectance *= (brdf / msCompensation) / pdf * abs(dot(N, (*ray).direction));
        }

        if (config.MIS_TYPE == ONE_SAMPLE_MODEL) {
          var pdf: f32; var misWeight: f32; var brdf: vec3f; var ls: vec3f;
          var isBrdfSample = rands1.w < 0.5;
          if (isBrdfSample) {
            shadeDielectricSampleBRDF(
              rands1, material, wo, &wi, ray, TBN, &brdf, &pdf, &misWeight
            );
          } else {
            shadeDielectricSampleLight(
              rands2, material, wo, &wi, ray, TBN, TBNinverse, 
              &brdf, &pdf, &misWeight, &ls
            );
          }

          (*ray).direction = normalize(TBN * wi);
          (*ray).origin = ires.hitPoint + (*ray).direction * 0.001;
          *reflectance *= (brdf / msCompensation) * (misWeight / pdf) * abs(dot(N, (*ray).direction));
        }

        if (config.MIS_TYPE == NEXT_EVENT_ESTIMATION) {
          var brdfSamplePdf: f32; var brdfMisWeight: f32; 
          var brdfSampleBrdf: vec3f; 

          var lightSamplePdf: f32; var lightMisWeight: f32; 
          var lightRadiance: vec3f; var lightSampleBrdf: vec3f;
          var lightSampleWi: vec3f;

          shadeDielectricSampleBRDF(
            rands1, material, wo, &wi, ray, TBN, &brdfSampleBrdf, &brdfSamplePdf, &brdfMisWeight
          );
          shadeDielectricSampleLight(
            rands2, material, wo, &lightSampleWi, ray, TBN, TBNinverse, 
            &lightSampleBrdf, &lightSamplePdf, &lightMisWeight, &lightRadiance
          );

          (*ray).direction = normalize(TBN * wi);
          (*ray).origin = ires.hitPoint + (*ray).direction * 0.001;
          // from tangent space to world space
          lightSampleWi = normalize(TBN * lightSampleWi);
          // *****************
          // The reason why we can use NEE without issues here is that if the light sample ray 
          // ends up inside the medium, the bvh intersection routine will find the other side of 
          // the object instead of a light source, thus setting misWeight to zero.
          // We're also making sure the light-sample ray is correctly being positioned inside or outside 
          // the medium before using the ray
          // *****************
          *rad += *reflectance * lightRadiance * (lightSampleBrdf / msCompensation) * 
            (lightMisWeight / lightSamplePdf) * abs(dot(N, lightSampleWi));
          
          *reflectance *= (brdfSampleBrdf / msCompensation) * (brdfMisWeight / brdfSamplePdf) * 
            abs(dot(N, (*ray).direction));
        }
      } 
    `;
  }
}
