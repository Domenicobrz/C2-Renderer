import type { Color } from 'three';
import { MATERIAL_TYPE, Material } from './material';

// from: https://www.pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory
export class Dielectric extends Material {
  private color: Color;
  private ax: number;
  private ay: number;
  private eta: number;

  constructor(color: Color, ax: number, ay: number, eta: number) {
    super();
    this.type = MATERIAL_TYPE.DIELECTRIC;
    this.color = color;
    this.ax = ax;
    this.ay = ay;
    this.eta = eta;
    this.offsetCount = 7;
  }

  getFloatsArray(): number[] {
    return [this.type, this.color.r, this.color.g, this.color.b, this.ax, this.ay, this.eta];
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct DIELECTRIC {
        color: vec3f,
        ax: f32,
        ay: f32,
        eta: f32,
      }
    `;
  }

  static shaderCreateStruct(): string {
    return /* wgsl */ `
      fn createDielectric(offset: u32) -> DIELECTRIC {
        var d: DIELECTRIC;
        d.color = vec3f(
          materialsData[offset + 1],
          materialsData[offset + 2],
          materialsData[offset + 3],
        );
        d.ax = materialsData[offset + 4];
        d.ay = materialsData[offset + 5];
        d.eta = materialsData[offset + 6];
        return d;
      } 
    `;
  }

  static shaderShadeDielectric(): string {
    return /* wgsl */ `
      // assuming throwbridge reitz distribution methods are already defined ...
      // assuming throwbridge reitz distribution methods are already defined ...
      // assuming throwbridge reitz distribution methods are already defined ...
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

      fn D_Sample_wm(w: vec3f, u: vec2f, alpha_x: f32, alpha_y: f32) -> vec3f {
      
      
      
        return vec3f(0);
      
      
      
      }

      fn D_PDF(wo: vec3f, wi: vec3f, material: DIELECTRIC) -> f32 {
        if (material.eta == 1 || (material.ax < 0.0005 && material.ay < 0.0005)) {
          return 1;
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
          // fragment should be discarded, lets return a super high pdf
          return 9999999999999999;
        }
        wm = FaceForward(normalize(wm), vec3f(0, 0, 1));

        if (dot(wm, wi) * cosTheta_i < 0 || dot(wm, wo) * cosTheta_o < 0) {
          // fragment should be discarded, lets return a super high pdf
          return 9999999999999999;
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
      fn D_Sample_f(
        wo:  vec3f, u: vec2f, 
        material: DIELECTRIC,
        color: vec3f,
        rands: vec4f,
        wi:  ptr<function, vec3f>,
        pdf: ptr<function, f32>,
        f:   ptr<function, vec3f>,
        tid: vec3u,
        i: i32
      ) {
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

      // I honestly don't understand why we need this one, it seems useless
      // I honestly don't understand why we need this one, it seems useless
      // unless it's being used to get the brdf when we sample light sources
      // or if for some strange reason we're not importance sampling the brdf and we're 
      // randomly throwing rays into the hemisphere
      fn D_f(wo: vec3f, wi: vec3f, material: DIELECTRIC, color: vec3f) -> vec3f {
        if (material.eta == 1.0 || (material.ax < 0.0005 && material.ay < 0.0005)) {
          // sample perfect specular BRDF
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

      fn shadeDielectric(
        ires: BVHIntersectionResult, 
        ray: ptr<function, Ray>,
        reflectance: ptr<function, vec3f>, 
        rad: ptr<function, vec3f>,
        tid: vec3u,
        i: i32
      ) {
        let hitPoint = ires.hitPoint;
        let material: DIELECTRIC = createDielectric(ires.triangle.materialOffset);

        let color = material.color;

        var N = ires.triangle.normal;     
        
        // we'll assume we're exiting the dielectric medium and apply
        // beer-lambert absorption 
        if (dot(N, (*ray).direction) > 0) {
          *reflectance *= vec3f(
            exp(-color.x * ires.t), 
            exp(-color.y * ires.t), 
            exp(-color.z * ires.t), 
          );
        }
        
        let rands = rand4(
          tid.y * canvasSize.x + tid.x +
          u32(cameraSample.x * 928373289 + cameraSample.y * 877973289) +
          u32(i * 17325799),
        );

        // we need to calculate a TBN matrix
        var tangent = vec3f(0.0);
        var bitangent = vec3f(0.0);
        getTangentFromTriangle(ires.triangle, &tangent, &bitangent);
        
        // var tangent = vec3f(1.0, 0.0, 0.0);
        // var bitangent = vec3f(0.0, 1.0, 0.0);

        // https://learnopengl.com/Advanced-Lighting/Normal-Mapping
        let TBN = mat3x3f(tangent, bitangent, N);
        // to transform vectors from world space to tangent space, we multiply by
        // the inverse of the TBN
        let TBNinverse = transpose(TBN);

        var wi = vec3f(0,0,0); 
        let wo = TBNinverse * -(*ray).direction;

        // some components cancel out when using this function, thus "reflectance"
        // takes into account cos(theta), the brdf, division by pdf and also the
        // color component
        var pdf = 0.0;
        var brdf = vec3f(1.0);
        D_Sample_f(wo, rands.xy, material, color, rands, &wi, &pdf, &brdf, tid, i);

        // to transform vectors from tangent space to world space, we multiply by
        // the TBN     
        // --- without normalization we might go slightly above 1 in length,
        // and that messes up envmap bilinear filtering
        (*ray).direction = normalize(TBN * wi);
        (*ray).origin = ires.hitPoint + (*ray).direction * 0.001;

        
        // *reflectance *= brdf / pdf * max(dot((*ray).direction, N), 0.0);
        let normRefl = abs(dot((*ray).direction, N));
        *reflectance *= brdf / pdf * normRefl;
      } 
    `;
  }
}
