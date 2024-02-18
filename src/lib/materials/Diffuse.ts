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
        // reflectance: ptr<function, vec3f>,
        W1: ptr<function, f32>,
        P1: ptr<function, f32>,
      ) {
        // why am I using uniform sampling? cosine weighted is better.
        // if you switch to another brdf pdf, remember to also update the light sample brdf's pdf
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
        // *reflectance /= pdf;
        
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
        // *reflectance /= pdf;

        // MIS with power heuristic:
        // let w = (brdfSamplePdf * brdfSamplePdf) / (brdfSamplePdf * brdfSamplePdf + lightSamplePdf * lightSamplePdf);
        // *reflectance = (*reflectance / brdfSamplePdf) * w * 2;

        // *reflectance *= brdf;

        *P1 = brdfSamplePdf;
        *W1 = brdfSamplePdf / (brdfSamplePdf + lightSamplePdf);
      }

      fn shadeDiffuseSampleLight(
        rands: vec4f, 
        N: vec3f,
        ray: ptr<function, Ray>, 
        // reflectance: ptr<function, vec3f>,
        W2: ptr<function, f32>,
        P2: ptr<function, f32>,
        F2: ptr<function, vec3f>,
      ) {
        let cdfEntry = getLightCDFEntry(rands.z);
        let triangle = triangles[cdfEntry.triangleIndex];
        let samplePoint = sampleTrianglePoint(triangle, rands.x, rands.y);

        let lD = normalize(samplePoint - (*ray).origin);
        (*ray).direction = lD;

        let r2 = squaredLength(samplePoint - (*ray).origin);
        var lN = triangle.normal;
        // THIS ONE IS LIKELY WRONG, PDF SHOULD BE ZERO IF DOT IS < 0 
        // THIS ONE IS LIKELY WRONG, PDF SHOULD BE ZERO IF DOT IS < 0 
        // THIS ONE IS LIKELY WRONG, PDF SHOULD BE ZERO IF DOT IS < 0 
        // THIS ONE IS LIKELY WRONG, PDF SHOULD BE ZERO IF DOT IS < 0 
        // THIS ONE IS LIKELY WRONG, PDF SHOULD BE ZERO IF DOT IS < 0 
        var lNolD = dot(lN, -lD);
        if (lNolD < 0) {
          lN = -lN;
          lNolD = -lNolD;
        }
        let theta = lNolD;
        let lightSamplePdf = r2 / (lNolD * triangle.area);
        let brdfSamplePdf = 1 / (2 * PI);

        // // non-MIS pdf:
        // // let pdf = lightSamplePdf * cdfEntry.pdf;

        // // MIS pdf:
        // let pdf = (brdfSamplePdf + lightSamplePdf * cdfEntry.pdf) * 0.5;
        // *reflectance /= pdf;

        // // MIS with power heuristics:
        // // let w = (lightSamplePdf * cdfEntry.pdf * lightSamplePdf * cdfEntry.pdf) / (brdfSamplePdf * brdfSamplePdf + lightSamplePdf * cdfEntry.pdf * lightSamplePdf * cdfEntry.pdf);
        // // *reflectance = (*reflectance / (lightSamplePdf * cdfEntry.pdf)) * w * 2;

        // let brdf = 1 / PI;

        // *reflectance *= brdf;


        
        *P2 = (lightSamplePdf * cdfEntry.pdf);
        *W2 = (lightSamplePdf * cdfEntry.pdf) / (brdfSamplePdf + lightSamplePdf * cdfEntry.pdf);

        let ires = bvhIntersect(*ray);
        let materialType = materialsData[ires.triangle.materialOffset];
        if (
          materialType == ${MATERIAL_TYPE.EMISSIVE} && 
          dot(triangle.normal, -lD) > 0
        ) {
          let material: Emissive = createEmissive(ires.triangle.materialOffset);
          let emissive = material.color * material.intensity;
          *F2 = emissive;
        } else {
          *P2 = 1;
          *W2 = 0;
          *F2 = vec3f(0.0);
        }
      }

      fn shadeDiffuse(
        ires: BVHIntersectionResult, 
        ray: ptr<function, Ray>,
        reflectance: ptr<function, vec3f>, 
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
    
        // if (rands.w < 0.5) {
        //   shadeDiffuseSampleBRDF(rands, N, ray, reflectance);
        // } else {
        //   shadeDiffuseSampleLight(rands, N, ray, reflectance);
        // }

        var brdf = 1 / PI;
        // refactor this to use SUMP instead of w1 & p1
        var W1: f32;
        var P1: f32;
        var W2: f32;
        var P2: f32;
        var F2: vec3f;
        var rayBrdf = Ray((*ray).origin, (*ray).direction);
        var rayLight = Ray((*ray).origin, (*ray).direction);
        shadeDiffuseSampleBRDF(rands, N, &rayBrdf, &W1, &P1);
        shadeDiffuseSampleLight(rands, N, &rayLight, &W2, &P2, &F2);

        (*ray).origin = rayBrdf.origin;
        (*ray).direction = rayBrdf.direction;

        *reflectance *= brdf * color;

        // light contribution
        *rad += F2 * (W2 / P2) * (*reflectance) * max(dot(N, rayLight.direction), 0.0);

        *reflectance *= (W1 / P1) * max(dot(N, (*ray).direction), 0.0);
      } 
    `;
  }
}
