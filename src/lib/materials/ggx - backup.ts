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
      // -- Ensure our sample is in the upper hemisphere
      // -- Since we are in tangent space with a y-up coordinate
      // -- system BsdfNDot(wi) simply returns wi.y
      fn BsdfNDot(direction: vec3f) -> f32 {
        return direction.y;
      }

      //====================================================================
      fn SchlickFresnel(r0: vec3f, radians: f32) -> vec3f {
        // -- The common Schlick Fresnel approximation
        let exponential = pow(1.0 - radians, 5.0);
        return r0 + (1.0f - r0) * exponential;
      }

      //====================================================================
      // non height-correlated masking-shadowing function is described here:
      fn SmithGGXMaskingShadowing(wi: vec3f, wo: vec3f, a2: f32) -> f32 {
        let dotNL = BsdfNDot(wi);
        let dotNV = BsdfNDot(wo);
      
        let denomA = dotNV * sqrt(a2 + (1.0 - a2) * dotNL * dotNL);
        let denomB = dotNL * sqrt(a2 + (1.0 - a2) * dotNV * dotNV);
      
        return 2.0 * dotNL * dotNV / (denomA + denomB);
      }

      //====================================================================
      // normal (wg) is assumed to be (0, 1, 0)
      // wo needs to be the negation of ray.direction
      fn ImportanceSampleGgxD(
        wo: vec3f, material: GGX, e0: f32, e1: f32,
        wi: ptr<function, vec3f>, reflectance: ptr<function, vec3f>)
      {
        let a = material.roughness;
        let a2 = a * a;       
      
        // -- Calculate theta and phi for our microfacet normal wm by
        // -- importance sampling the Ggx distribution of normals
        let theta = acos(sqrt((1.0 - e0) / ((a2 - 1.0) * e0 + 1.0)));
        let phi   = 2 * PI * e1;
      
        // -- Convert from spherical to Cartesian coordinates
        let wm = sphericalToCartesian(theta, phi);
      
        // -- Calculate wi by reflecting wo about wm
        *wi = 2.0 * dot(wo, wm) * wm - wo;
      
        // -- Ensure our sample is in the upper hemisphere
        // -- Since we are in tangent space with a y-up coordinate
        // -- system BsdfNDot(wi) simply returns wi.y
        if (BsdfNDot(*wi) > 0.0 && dot(*wi, wm) > 0.0) {
        
        	let dotWiWm = dot(*wi, wm);
        
          // -- calculate the reflectance to multiply by the energy
          // -- retrieved in direction wi
          let F = SchlickFresnel(material.color, dotWiWm);
          let G = SmithGGXMaskingShadowing(*wi, wo, a2);
          let weight = abs(dot(wo, wm))
                       / (BsdfNDot(wo) * BsdfNDot(wm));
        
          *reflectance = F * G * weight; 
        }
        else {
          *reflectance = vec3f(0,0,0);
        }
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
          -(*ray).direction, Nt, N, Nb
        );

        // some components cancel out when using this function, thus "reflectance"
        // takes into account cos(theta), the brdf, division by pdf and also the
        // color component
        ImportanceSampleGgxD(wo, material, rands.x, rands.y, &wi, &ggxReflectance);

        *reflectance *= ggxReflectance;
    
        (*ray).direction = normalize(Nt * wi.x + N * wi.y + Nb * wi.z);
      } 
    `;
  }
}
