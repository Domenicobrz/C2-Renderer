import type { Color } from 'three';
import { MATERIAL_TYPE, Material } from './material';

export class Diffuse extends Material {
  private color: Color;

  constructor(color: Color) {
    super();
    this.type = MATERIAL_TYPE.DIFFUSE;
    this.color = color;
    this.bytesCount = 4;
  }

  getFloatsArray(): number[] {
    return [this.type, this.color.r, this.color.g, this.color.b];
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct Diffuse {
        color: vec3f
      }
    `;
  }

  static shaderCreateStruct(): string {
    return /* wgsl */ `
      fn createDiffuse(offset: u32) -> Diffuse {
        var diffuse: Diffuse;
        diffuse.color = vec3f(
          materialsData[offset + 1],
          materialsData[offset + 2],
          materialsData[offset + 3],
        );
        return diffuse;
      } 
    `;
  }

  static shaderShadeDiffuse(): string {
    return /* wgsl */ `
      fn shadeDiffuseSampleBRDF(
        rands: vec4f, 
        N: vec3f, 
        ray: ptr<function, Ray>, 
        reflectance: ptr<function, vec3f>
      ) {
        let r0 = 2.0 * PI * rands.x;
        let r1 = acos(rands.y);
        let nd = normalize(vec3f(
          sin(r0) * sin(r1),
          cos(r1),
          cos(r0) * sin(r1),
        ));
    
        var Nt = vec3f(0,0,0);
        var Nb = vec3f(0,0,0);
        getCoordinateSystem(N, &Nt, &Nb);
    
        (*ray).direction = normalize(Nt * nd.x + N * nd.y + Nb * nd.z);

        let brdf = 1 / PI;
        // non-MIS pdf:
        let pdf = 1 / (2 * PI);
        // MIS pdf:
        // ...

        *reflectance *= brdf;
        *reflectance /= pdf;
      }

      fn shadeDiffuse(
        ires: BVHIntersectionResult, 
        ray: ptr<function, Ray>,
        mult: ptr<function, vec3f>, 
        rad: ptr<function, vec3f>,
        gid: vec3u,
        i: i32
      ) {
        let hitPoint = ires.hitPoint;
        let material: Diffuse = createDiffuse(ires.triangle.materialOffset);

        let color = material.color;
    
        var N = ires.triangle.normal;
        if (dot(N, (*ray).direction) > 0) {
          N = -N;
        }
    
        (*ray).origin = ires.hitPoint - (*ray).direction * 0.001;
    
        let rands = rand4(
          gid.y * canvasSize.x + gid.x +
          u32(cameraSample.x * 928373289 + cameraSample.y * 877973289) +
          u32(i * 17325799),
        );
    
        // I need both pdfs, and have to sum them togheter
        // but wait.. how do I get the area based pdf if I select to sample the brdf?
        // apparently, according to gpt4, I should shoot a ray and if it hits a light source
        // then calculate the pdf that way.
        // also I shold look into "next event estimation"

        shadeDiffuseSampleBRDF(rands, N, ray, mult);
        *mult *= max(dot(N, (*ray).direction), 0.0);
        *mult *= color;
      } 
    `;
  }
}
