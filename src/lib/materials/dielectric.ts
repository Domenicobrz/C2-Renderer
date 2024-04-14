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

      // fn D_Sample_wm(w: vec3f, u: vec2f, alpha_x: f32, alpha_y: f32) -> vec3f {
      //   return vec3f(0);
      // }
      // fn D_PDF(wo: vec3f, wi: vec3f, alpha_x: f32, alpha_y: f32) -> f32 {
      //   return 0;
      // }

      // this function samples the new wi direction, and returns the brdf and pdf
      fn D_Sample_f(
        wo:  vec3f, u: vec2f, 
        material: DIELECTRIC,
        color: vec3f,
        uc: f32,
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

          let f = vec3f(0.0);

          if (isFloatNaN(f.x) || isFloatNaN(f.y) || isFloatNaN(f.z)) {
            return vec3f(0);
          }
          
          return f;
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
    
        let rands = rand4(
          tid.y * canvasSize.x + tid.x +
          u32(cameraSample.x * 928373289 + cameraSample.y * 877973289) +
          u32(i * 17325799),
        );

        // we need to calculate a TBN matrix
        var tangent = vec3f(0.0);
        var bitangent = vec3f(0.0);
        getTangentFromTriangle(ires.triangle, &tangent, &bitangent);

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
        D_Sample_f(wo, rands.xy, material, color, rands.x, &wi, &pdf, &brdf, tid, i);

        // to transform vectors from tangent space to world space, we multiply by
        // the TBN     
        (*ray).direction = TBN * wi;
        (*ray).origin = ires.hitPoint + (*ray).direction * 0.001;

        
        // *reflectance *= brdf / pdf * max(dot((*ray).direction, N), 0.0);
        let normRefl = abs(dot((*ray).direction, N));
        *reflectance *= brdf / pdf * normRefl;
      } 
    `;
  }
}
