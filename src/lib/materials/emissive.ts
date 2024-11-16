import type { Color } from 'three';
import { MATERIAL_TYPE, Material } from './material';

export class Emissive extends Material {
  public color: Color;
  public intensity: number;

  constructor({
    color,
    intensity = 1,
    flipTextureY = false
  }: {
    color: Color;
    intensity: number;
    flipTextureY?: boolean;
  }) {
    super({ flipTextureY });
    this.type = MATERIAL_TYPE.EMISSIVE;
    this.color = color;
    this.intensity = intensity;
    this.offsetCount = 5;
  }

  getFloatsArray(): number[] {
    return [this.type, this.color.r, this.color.g, this.color.b, this.intensity];
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct Emissive {
        color: vec3f,
        intensity: f32,
      }
    `;
  }

  static shaderCreateStruct(): string {
    return /* wgsl */ `
      fn createEmissive(offset: u32) -> Emissive {
        var emissive: Emissive;
        emissive.color = vec3f(
          materialsData[offset + 1],
          materialsData[offset + 2],
          materialsData[offset + 3],
        );
        emissive.intensity = materialsData[offset + 4];

        return emissive;
      } 
    `;
  }

  static shaderShadeEmissive(): string {
    return /* wgsl */ `
      fn shadeEmissive(
        ires: BVHIntersectionResult, 
        ray: ptr<function, Ray>,
        reflectance: ptr<function, vec3f>, 
        rad: ptr<function, vec3f>,
        tid: vec3u,
        i: i32
      ) {
        /*
          **************************
          ***** important note *****
          **************************

          If you ever decide to apply MIS / NEE on emissive surfaces,
          remember to invalidate light source samples that selected the same light source 
          that is being shaded
        */

        let hitPoint = ires.hitPoint;
        let material: Emissive = createEmissive(ires.triangle.materialOffset);

        let albedo = vec3f(1,1,1);
        let emissive = material.color * material.intensity;

        var N = ires.triangle.geometricNormal;
        if (dot(N, (*ray).direction) > 0) {
          N = -N;
        } else {
          *rad += emissive * *reflectance;
        }
    
        (*ray).origin = ires.hitPoint - (*ray).direction * 0.001;
    
        let rands = vec4f(getRand2D(), getRand2D());
    
        let r0 = 2.0 * PI * rands.x;
        let r1 = acos(rands.y);
        let nd = normalize(vec3f(
          sin(r0) * sin(r1),
          cos(r1),
          cos(r0) * sin(r1),
        ));

    
        var tangent = vec3f(0.0);
        var bitangent = vec3f(0.0);
        getTangentFromTriangle(ires, ires.triangle, N, &tangent, &bitangent);
      
        // https://learnopengl.com/Advanced-Lighting/Normal-Mapping
        let TBN = mat3x3f(tangent, bitangent, N);
        // from tangent space to world space
        (*ray).direction = normalize(TBN * nd.xzy);

        *reflectance *= albedo * max(dot(N, (*ray).direction), 0.0) * (1 / PI) * (2 * PI);
      } 
    `;
  }
}
