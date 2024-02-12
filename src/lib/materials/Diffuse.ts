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
        // why am I using uniform sampling? cosine weighted is better.
        let rand_1 = rands.x;
        let rand_2 = rands.y;
        let phi = 2.0 * PI * rand_1;
        let root = sqrt(1 - rand_2 * rand_2);
        let nd = vec3f(cos(phi) * root, rand_2, sin(phi) * root);

        let brdf = 1 / PI;
        let brdfSamplePdf = 1 / (2 * PI);


        var Nt = vec3f(0,0,0);
        var Nb = vec3f(0,0,0);
        getCoordinateSystem(N, &Nt, &Nb);
    
        (*ray).direction = normalize(Nt * nd.x + N * nd.y + Nb * nd.z);

        // non-MIS pdf:
        // let pdf = 1 / (2 * PI);
        
        // MIS pdf:
        let ires = bvhIntersect(*ray);
        let materialType = materialsData[ires.triangle.materialOffset];
        var lightSamplePdf = 0.0;
        if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
          let lD = (*ray).direction;
          let r2 = squaredLength(ires.hitPoint - (*ray).origin);
          var lN = ires.triangle.normal;
          var lNolD = dot(lN, -lD);
          if (lNolD < 0) {
            lN = -lN;
            lNolD = -lNolD;
          }
          let theta = lNolD;
          lightSamplePdf = r2 / (lNolD * ires.triangle.area);
        }
        let pdf = (brdfSamplePdf + lightSamplePdf) * 0.5;
        *reflectance /= pdf;
        // MIS with power heuristic:
        // let w = (brdfSamplePdf * brdfSamplePdf) / (brdfSamplePdf * brdfSamplePdf + lightSamplePdf * lightSamplePdf);
        // *reflectance = (*reflectance / brdfSamplePdf) * w * 2;

        *reflectance *= brdf;
      }

      fn shadeDiffuseSampleLight(
        rands: vec4f, 
        N: vec3f,
        ray: ptr<function, Ray>, 
        reflectance: ptr<function, vec3f>,
      ) {
        let cdfEntry = getLightCDFEntry(rands.z);
        let triangle = triangles[cdfEntry.triangleIndex];
        let samplePoint = sampleTrianglePoint(triangle, rands.x, rands.y);

        let lD = normalize(samplePoint - (*ray).origin);
        (*ray).direction = lD;

        let r2 = squaredLength(samplePoint - (*ray).origin);
        var lN = triangle.normal;
        var lNolD = dot(lN, -lD);
        if (lNolD < 0) {
          lN = -lN;
          lNolD = -lNolD;
        }
        let theta = lNolD;
        let lightSamplePdf = r2 / (lNolD * triangle.area);
        let brdfSamplePdf = 1 / (2 * PI);

        // non-MIS pdf:
        // let pdf = lightSamplePdf * cdfEntry.pdf;
        // MIS pdf:
        let pdf = (brdfSamplePdf + lightSamplePdf * cdfEntry.pdf) * 0.5;
        *reflectance /= pdf;
        // MIS with power heuristics:
        // let w = (lightSamplePdf * cdfEntry.pdf * lightSamplePdf * cdfEntry.pdf) / (brdfSamplePdf * brdfSamplePdf + lightSamplePdf * cdfEntry.pdf * lightSamplePdf * cdfEntry.pdf);
        // *reflectance = (*reflectance / (lightSamplePdf * cdfEntry.pdf)) * w * 2;

        let brdf = 1 / PI;

        *reflectance *= brdf;
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
    
        // as I'm doing all of this, remember that emissive.ts knows none of this
        // as I'm doing all of this, remember that emissive.ts knows none of this
        // as I'm doing all of this, remember that emissive.ts knows none of this
        // as I'm doing all of this, remember that emissive.ts knows none of this

        // something strange I noted...
        // if I set r2 as a constant value here:
        // let lightSamplePdf = r2 / (lNolD * triangle.area);
        // in the light sampling routine, the image converges MUCH faster
        // it seems that when r2 is extremely small, maybe when we get in the roof very
        // close to the light source, the pdf shoots up and creates a crazy amount of fireflies

        if (rands.w < 0.5) {
          shadeDiffuseSampleBRDF(rands, N, ray, mult);
        } else {
          shadeDiffuseSampleLight(rands, N, ray, mult);
        }

        *mult *= color;
        *mult *= max(dot(N, (*ray).direction), 0.0);
      } 
    `;
  }
}
