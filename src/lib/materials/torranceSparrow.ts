import type { Color } from 'three';
import { MATERIAL_TYPE, Material } from './material';

// from: https://www.pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory
export class TorranceSparrow extends Material {
  private color: Color;
  private ax: number;
  private ay: number;

  constructor(color: Color, ax: number, ay: number) {
    super();
    this.type = MATERIAL_TYPE.TORRANCE_SPARROW;
    this.color = color;
    this.ax = ax;
    this.ay = ay;
    this.offsetCount = 6;
  }

  getFloatsArray(): number[] {
    return [this.type, this.color.r, this.color.g, this.color.b, this.ax, this.ay];
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct TORRANCE_SPARROW {
        color: vec3f,
        ax: f32,
        ay: f32,
      }
    `;
  }

  static shaderCreateStruct(): string {
    return /* wgsl */ `
      fn createTorranceSparrow(offset: u32) -> TORRANCE_SPARROW {
        var ts: TORRANCE_SPARROW;
        ts.color = vec3f(
          materialsData[offset + 1],
          materialsData[offset + 2],
          materialsData[offset + 3],
        );
        ts.ax = materialsData[offset + 4];
        ts.ay = materialsData[offset + 5];
        return ts;
      } 
    `;
  }

  static shaderShadeTorranceSparrow(): string {
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
        if (!SameHemisphere(wo, wi)) {
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
        tid: vec3u,
        i: i32
      ) {
        let wm = TS_Sample_wm(wo, u, alpha_x, alpha_y);
        // reflect from wgsl needs the wo vector to point "inside" the surface
        // whereas the implementation in pbrt v4 has wo pointing to the camera 
        *wi = reflect(-wo, wm);

        if (!SameHemisphere(wo, *wi)) {
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

      // I honestly don't understand why we need this one, it seems useless
      // I honestly don't understand why we need this one, it seems useless
      // unless it's being used to get the brdf when we sample light sources
      // or if for some strange reason we're not importance sampling the brdf and we're 
      // randomly throwing rays into the hemisphere
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

      fn shadeTorranceSparrow(
        ires: BVHIntersectionResult, 
        ray: ptr<function, Ray>,
        reflectance: ptr<function, vec3f>, 
        rad: ptr<function, vec3f>,
        tid: vec3u,
        i: i32
      ) {
        let hitPoint = ires.hitPoint;
        let material: TORRANCE_SPARROW = createTorranceSparrow(ires.triangle.materialOffset);

        let color = material.color;

        var N = ires.triangle.normal;
        if (dot(N, (*ray).direction) > 0) {
          N = -N;
        }
        
        (*ray).origin = ires.hitPoint - (*ray).direction * 0.001;
    
        let rands = rand4(
          tid.y * canvasSize.x + tid.x +
          u32(cameraSample.x * 928373289 + cameraSample.y * 877973289) +
          u32(i * 17325799),
        );

        // we need to calculate a TBN matrix
        var tangent = vec3f(0.0);
        var bitangent = vec3f(0.0);
        getTangentFromTriangle(ires.triangle, &tangent, &bitangent);

        // normal could be flipped at some point, should we also flip TB?
        // normal could be flipped at some point, should we also flip TB?
        // normal could be flipped at some point, should we also flip TB?
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
        TS_Sample_f(wo, rands.xy, material.ax, material.ay, color, &wi, &pdf, &brdf, tid, i);

        // to transform vectors from tangent space to world space, we multiply by
        // the TBN     
        (*ray).direction = TBN * wi;

        *reflectance *= brdf / pdf * max(dot((*ray).direction, N), 0.0);
      } 
    `;
  }
}
