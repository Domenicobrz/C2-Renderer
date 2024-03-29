import type { Color } from 'three';
import { MATERIAL_TYPE, Material } from './material';

// from: https://schuttejoe.github.io/post/ggximportancesamplingpart1/
export class GGX extends Material {
  private color: Color;
  private roughness: number;

  constructor(color: Color, roughness: number) {
    super();
    this.type = MATERIAL_TYPE.GGX;
    this.color = color;
    this.roughness = roughness;
    this.bytesCount = 5;
  }

  getFloatsArray(): number[] {
    return [this.type, this.color.r, this.color.g, this.color.b, this.roughness];
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct GGX {
        color: vec3f,
        roughness: f32,
      }
    `;
  }

  static shaderCreateStruct(): string {
    return /* wgsl */ `
      fn createGGX(offset: u32) -> GGX {
        var ggx: GGX;
        ggx.color = vec3f(
          materialsData[offset + 1],
          materialsData[offset + 2],
          materialsData[offset + 3],
        );
        ggx.roughness = materialsData[offset + 4];
        return ggx;
      } 
    `;
  }

  static shaderShadeGGX(): string {
    return /* wgsl */ `

      // TrowbridgeReitzDistribution mfDistrib;
      // SampledSpectrum eta, k;
      fn SameHemisphere(w: vec3f, wp: vec3f) -> bool {
        return w.z * wp.z > 0;
      }
      fn AbsDot(v1: vec3f, v2: vec3f) -> f32 { 
        return abs(dot(v1, v2)); 
      }
      fn FaceForward(n: vec3f, v: vec3f) -> vec3f {
        if (dot(n, v) < 0) { 
          return -n;
        } else {
          return n;
        }
      }
      fn LengthSquared(v: vec3f) -> f32 { 
        return Sqr(v.x) + Sqr(v.y) + Sqr(v.z); 
      }
      fn LengthSquaredV2(v: vec2f) -> f32 { 
        return Sqr(v.x) + Sqr(v.y); 
      }
      fn SampleUniformDiskPolar(u: vec2f) -> vec2f {
        let r = sqrt(u.x);
        let theta = 2 * PI * u.y;
        return vec2f(r * cos(theta), r * sin(theta));
      }
      fn Lerp(x: f32, a: f32, b: f32) -> f32 {
        return (1 - x) * a + x * b;
      }
      fn AbsCosTheta(w: vec3f) -> f32 { 
        return abs(w.z); 
      }
      fn Sqr(v: f32) -> f32 {
        return v * v;
      }
      fn Cos2Theta(w: vec3f) -> f32 { 
        return Sqr(w.z); 
      }
      fn Sin2Theta(w: vec3f) -> f32 { 
        return max(0, 1 - Cos2Theta(w)); 
      }
      fn SinTheta(w: vec3f) -> f32 { 
        return sqrt(Sin2Theta(w)); 
      }
      fn Tan2Theta(w: vec3f) -> f32 { 
        return Sin2Theta(w) / Cos2Theta(w); 
      }
      fn CosPhi(w: vec3f) -> f32 {
        let sinTheta = SinTheta(w);
        if (sinTheta == 0) {
          return 1;
        } else {
          return clamp(w.x / sinTheta, -1, 1);
        }
      }
      fn SinPhi(w: vec3f) -> f32 {
        let sinTheta = SinTheta(w);
        if (sinTheta == 0) {
          return 0;
        } else {
          return clamp(w.y / sinTheta, -1, 1);
        }
      }
      fn IsInf(v: f32) -> bool {
        return v > 999999999999999.0;
      }
      fn SchlickFresnel(r0: vec3f, radians: f32) -> vec3f {
        // -- The common Schlick Fresnel approximation
        let exponential = pow(1.0 - radians, 5.0);
        return r0 + (1.0f - r0) * exponential;
      }
      // throwbridge reitz distribution
      fn D(wm: vec3f, alpha_x: f32, alpha_y: f32) -> f32 {
        let tan2Theta = Tan2Theta(wm);
        if (IsInf(tan2Theta)) {
          return 0;
        }

        let cos4Theta = Sqr(Cos2Theta(wm));
        let e = tan2Theta * (Sqr(CosPhi(wm) / alpha_x) +
                               Sqr(SinPhi(wm) / alpha_y));
        return 1 / (PI * alpha_x * alpha_y * cos4Theta * Sqr(1 + e));
      }
      fn Lambda(w: vec3f, alpha_x: f32, alpha_y: f32) -> f32 {
        let tan2Theta = Tan2Theta(w);
        if (IsInf(tan2Theta)) {
          return 0;
        }
        let alpha2 = Sqr(CosPhi(w) * alpha_x) + Sqr(SinPhi(w) * alpha_y);
        return (sqrt(1 + alpha2 * tan2Theta) - 1) / 2;
      }
      fn G1(w: vec3f, alpha_x: f32, alpha_y: f32) -> f32 { 
        return 1 / (1 + Lambda(w, alpha_x, alpha_y)); 
      }
      fn G(wo: vec3f, wi: vec3f, alpha_x: f32, alpha_y: f32) -> f32 {
        return 1 / (1 + Lambda(wo, alpha_x, alpha_y) + Lambda(wi, alpha_x, alpha_y));
      }
      // overloading will be supported in the future, so for now it's D2...
      // https://github.com/gpuweb/gpuweb/issues/4507#issuecomment-1989674670
      fn D2(w: vec3f, wm: vec3f, alpha_x: f32, alpha_y: f32) -> f32 {
        return G1(w, alpha_x, alpha_y) / AbsCosTheta(w) * D(wm, alpha_x, alpha_y) * AbsDot(w, wm);
      }
      fn throwbridgeReitzDistributionPDF(w: vec3f, wm: vec3f, alpha_x: f32, alpha_y: f32) -> f32 { 
        return D2(w, wm, alpha_x, alpha_y); 
      }
      fn Sample_wm(w: vec3f, u: vec2f, alpha_x: f32, alpha_y: f32) -> vec3f {
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
      fn PDF(wo: vec3f, wi: vec3f, alpha_x: f32, alpha_y: f32) -> f32 {
        if (!SameHemisphere(wo, wi)) {
          return 0;
        }
        var wm = wo + wi;
        if (LengthSquared(wm) == 0) {
          return 0;
        }
        wm = FaceForward(normalize(wm), vec3f(0, 0, 1)); 
        return throwbridgeReitzDistributionPDF(wo, wm, alpha_x, alpha_y) / (4 * AbsDot(wo, wm));
      }

      // this function samples the new wi direction, and returns the brdf and pdf
      fn Sample_f(
        wo:  vec3f, u: vec2f, alpha_x: f32, alpha_y: f32, 
        color: vec3f,
        wi:  ptr<function, vec3f>,
        pdf: ptr<function, f32>,
        f:   ptr<function, vec3f>,
        tid: vec3u,
        i: i32
      ) {
        let wm = Sample_wm(wo, u, alpha_x, alpha_y);
        // reflect from wgsl needs the wo vector to point "inside" the surface
        // whereas the implementation in pbrt v4 has wo pointing to the camera 
        *wi = reflect(-wo, wm);

        // if (debugPixelTarget.x == tid.x && debugPixelTarget.y == tid.y) {
        //   debugBuffer[5] = 999.0;
        //   debugBuffer[6] = 999.0;
        //   debugBuffer[7] = 999.0;
        //   debugBuffer[8]  = (wo).x;
        //   debugBuffer[9]  = (wo).y;
        //   debugBuffer[10] = (wo).z;
        //   debugBuffer[11] = 999.0;
        //   debugBuffer[12] = 999.0;
        //   debugBuffer[13] = 999.0;
        //   debugBuffer[14] = (*wi).x;
        //   debugBuffer[15] = (*wi).y;
        //   debugBuffer[16] = (*wi).z;
        //   debugBuffer[17] = 999.0;
        //   debugBuffer[18] = 999.0;
        //   debugBuffer[19] = 999.0;
        //   debugBuffer[20] = wm.x;
        //   debugBuffer[21] = wm.y;
        //   debugBuffer[22] = wm.z;
        // }

        if (!SameHemisphere(wo, *wi)) {
          *f = vec3f(0.0);
          *pdf = 1.0;
          return;
        }

        *pdf = PDF(wo, *wi, alpha_x, alpha_y);
      
        let cosTheta_o = AbsCosTheta(wo);
        let cosTheta_i = AbsCosTheta(*wi);

        let F = SchlickFresnel(color, dot(*wi, wm));

        *f = D(wm, alpha_x, alpha_y) * F * G(wo, *wi, alpha_x, alpha_y) /
                            (4 * cosTheta_i * cosTheta_o);
      }

      // I honestly don't understand why we need this one, it seems useless
      // I honestly don't understand why we need this one, it seems useless
      // unless it's being used to get the brdf when we sample light sources
      // or if for some strange reason we're not importance sampling the brdf and we're 
      // randomly throwing rays into the hemisphere
      fn f(wo: vec3f, wi: vec3f, alpha_x: f32, alpha_y: f32, color: vec3f) -> vec3f {
        if (!SameHemisphere(wo, wi)) {
          return vec3f(0.0);
        }

        let cosTheta_o = AbsCosTheta(wo);
        let cosTheta_i = AbsCosTheta(wi);
        if (cosTheta_i == 0 || cosTheta_o == 0) {
          return vec3f(0, 0, 0);
        }
        var wm = wi + wo;
        if (LengthSquared(wm) == 0) {
          return vec3f(0, 0, 0);
        }
        wm = normalize(wm);

        let F = SchlickFresnel(color, dot(wi, wm));
        
        return D(wm, alpha_x, alpha_y) * F * G(wo, wi, alpha_x, alpha_y) /
               (4 * cosTheta_i * cosTheta_o);
      }

      fn shadeGGX(
        ires: BVHIntersectionResult, 
        ray: ptr<function, Ray>,
        reflectance: ptr<function, vec3f>, 
        rad: ptr<function, vec3f>,
        tid: vec3u,
        i: i32
      ) {
        let hitPoint = ires.hitPoint;
        let material: GGX = createGGX(ires.triangle.materialOffset);

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

        var ggxReflectance = vec3f(0,0,0);

        var Nt = vec3f(0,0,0);
        var Nb = vec3f(0,0,0);
        getCoordinateSystem(N, &Nt, &Nb);

        var wi = vec3f(0,0,0); 
        let wo = expressInAnotherCoordinateSystem(
          // note that in pbrt the normal points in the Z direction,
          // thus compared to the other implementation, here we're doing Nt, Nb, N instead of
          // Nt, N, Nb
          // this change is also reflected in the penultima line when we're setting
          // the ray direction
          -(*ray).direction, Nt, Nb, N
        );

        // some components cancel out when using this function, thus "reflectance"
        // takes into account cos(theta), the brdf, division by pdf and also the
        // color component
        var pdf = 0.0;
        var brdf = vec3f(1.0);
        Sample_f(wo, rands.xy, 0.01, 0.01, color, &wi, &pdf, &brdf, tid, i);

        (*ray).direction = normalize(Nt * wi.x + Nb * wi.y + N * wi.z);

        *reflectance *= brdf / pdf * max(dot((*ray).direction, N), 0.0);
      } 
    `;
  }
}
