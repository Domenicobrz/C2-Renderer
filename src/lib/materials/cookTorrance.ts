import type { Color } from 'three';
import { MATERIAL_TYPE, Material } from './material';

// from: https://schuttejoe.github.io/post/ggximportancesamplingpart1/
// !!! TODO: IMPLEMENT PART 2 !!!
export class CookTorrance extends Material {
  private color: Color;
  private roughness: number;

  constructor(color: Color, roughness: number) {
    super();
    this.type = MATERIAL_TYPE.COOK_TORRANCE;
    this.color = color;
    this.roughness = roughness;
    this.offsetCount = 5;
  }

  getFloatsArray(): number[] {
    return [this.type, this.color.r, this.color.g, this.color.b, this.roughness];
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct COOK_TORRANCE {
        color: vec3f,
        roughness: f32,
      }
    `;
  }

  static shaderCreateStruct(): string {
    return /* wgsl */ `
      fn createCookTorrance(offset: u32) -> COOK_TORRANCE {
        var ct: COOK_TORRANCE;
        ct.color = vec3f(
          materialsData[offset + 1],
          materialsData[offset + 2],
          materialsData[offset + 3],
        );
        ct.roughness = materialsData[offset + 4];
        return ct;
      } 
    `;
  }

  static shaderShadeCookTorrance(): string {
    return /* wgsl */ `
      // -- Ensure our sample is in the upper hemisphere
      // -- Since we are in tangent space with a y-up coordinate
      // -- system CT_BsdfNDot(wi) simply returns wi.y
      fn CT_BsdfNDot(direction: vec3f) -> f32 {
        return direction.y;
      }

      //====================================================================
      // non height-correlated masking-shadowing function is described here:
      fn CT_SmithGGXMaskingShadowing(wi: vec3f, wo: vec3f, a2: f32) -> f32 {
        let dotNL = CT_BsdfNDot(wi);
        let dotNV = CT_BsdfNDot(wo);
      
        let denomA = dotNV * sqrt(a2 + (1.0 - a2) * dotNL * dotNL);
        let denomB = dotNL * sqrt(a2 + (1.0 - a2) * dotNV * dotNV);
      
        return 2.0 * dotNL * dotNV / (denomA + denomB);
      }

      //====================================================================
      // normal (wg) is assumed to be (0, 1, 0)
      // wo needs to be the negation of ray.direction
      fn CT_ImportanceSampleGgxD(
        wo: vec3f, material: COOK_TORRANCE, e0: f32, e1: f32,
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
        // -- system CT_BsdfNDot(wi) simply returns wi.y
        if (CT_BsdfNDot(*wi) > 0.0 && dot(*wi, wm) > 0.0) {
        
        	let dotWiWm = dot(*wi, wm);
        
          // -- calculate the reflectance to multiply by the energy
          // -- retrieved in direction wi
          let F = SchlickFresnel(material.color, dotWiWm);
          let G = CT_SmithGGXMaskingShadowing(*wi, wo, a2);
          let weight = abs(dot(wo, wm))
                       / (CT_BsdfNDot(wo) * CT_BsdfNDot(wm));
        
          *reflectance = F * G * weight; 
        }
        else {
          *reflectance = vec3f(0,0,0);
        }
      }

      fn shadeCookTorrance(
        ires: BVHIntersectionResult, 
        ray: ptr<function, Ray>,
        reflectance: ptr<function, vec3f>, 
        rad: ptr<function, vec3f>,
        tid: vec3u,
        i: i32
      ) {
        let hitPoint = ires.hitPoint;
        let material: COOK_TORRANCE = createCookTorrance(ires.triangle.materialOffset);

        let color = material.color;
    
        var N = ires.triangle.normal;
        if (dot(N, (*ray).direction) > 0) {
          N = -N;
        }
        
        (*ray).origin = ires.hitPoint - (*ray).direction * 0.001;
    
        let rands = rand4(
          tid.y * canvasSize.x + tid.x +
          u32(cameraSamples.a.x * 928373289 + cameraSamples.a.y * 877973289) +
          u32(i * 17325799),
        );

        var ctReflectance = vec3f(0,0,0);

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
        CT_ImportanceSampleGgxD(wo, material, rands.x, rands.y, &wi, &ctReflectance);

        *reflectance *= ctReflectance;
    
        (*ray).direction = normalize(Nt * wi.x + N * wi.y + Nb * wi.z);
      } 
    `;
  }
}
