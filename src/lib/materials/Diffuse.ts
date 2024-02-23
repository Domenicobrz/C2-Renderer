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
        pdf: ptr<function, f32>,
        misWeight: ptr<function, f32>,
      ) {
        // why am I using uniform sampling? cosine weighted is better.
        // if you switch to another brdf pdf, remember to also update the light sample brdf's pdf
        // if you switch to another brdf pdf, remember to also update the light sample brdf's pdf
        // if you switch to another brdf pdf, remember to also update the light sample brdf's pdf
        let rand_1 = rands.x;
        let rand_2 = rands.y;
        let phi = 2.0 * PI * rand_1;
        let root = sqrt(1 - rand_2 * rand_2);
        let nd = vec3f(cos(phi) * root, rand_2, sin(phi) * root);

        var brdfSamplePdf = 1 / (2 * PI);

        var Nt = vec3f(0,0,0);
        var Nb = vec3f(0,0,0);
        getCoordinateSystem(N, &Nt, &Nb);
    
        (*ray).direction = normalize(Nt * nd.x + N * nd.y + Nb * nd.z);

        if (config.MIS_TYPE == BRDF_ONLY) {
          *pdf = brdfSamplePdf;
        } 

        if (config.MIS_TYPE == ONE_SAMPLE_MODEL || config.MIS_TYPE == NEXT_EVENT_ESTIMATION) {
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

          if (config.MIS_TYPE == ONE_SAMPLE_MODEL) {
            *pdf = brdfSamplePdf;
            *misWeight = brdfSamplePdf / ((brdfSamplePdf + lightSamplePdf) * 0.5);
            if (config.USE_POWER_HEURISTIC == 1) {
              let b1 = brdfSamplePdf;
              let b2 = lightSamplePdf;
              *misWeight = (b1 * b1) / ((b1 * b1 + b2 * b2) * 0.5);
            }
          }

          if (config.MIS_TYPE == NEXT_EVENT_ESTIMATION) {
            *pdf = brdfSamplePdf;
            *misWeight = brdfSamplePdf / (brdfSamplePdf + lightSamplePdf);
            if (config.USE_POWER_HEURISTIC == 1) {
              let b1 = brdfSamplePdf;
              let b2 = lightSamplePdf;
              *misWeight = (b1 * b1) / (b1 * b1 + b2 * b2);
            }
          }
        }
      }

      fn shadeDiffuseSampleLight(
        rands: vec4f, 
        N: vec3f,
        ray: ptr<function, Ray>, 
        pdf: ptr<function, f32>,
        misWeight: ptr<function, f32>,
        lightSample: ptr<function, vec3f>,
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
        var lightSamplePdf = r2 / (lNolD * triangle.area);
        var brdfSamplePdf = 1 / (2 * PI);

        if (config.MIS_TYPE == ONE_SAMPLE_MODEL) {
          *pdf = (lightSamplePdf * cdfEntry.pdf);
          *misWeight = *pdf / ((brdfSamplePdf + *pdf) * 0.5);
          if (config.USE_POWER_HEURISTIC == 1) {
            let b1 = (lightSamplePdf * cdfEntry.pdf);
            let b2 = brdfSamplePdf;
            *misWeight = (b1 * b1) / ((b1 * b1 + b2 * b2) * 0.5);
          }
        }

        if (config.MIS_TYPE == NEXT_EVENT_ESTIMATION) {
          *pdf = (lightSamplePdf * cdfEntry.pdf);
          *misWeight = *pdf / (brdfSamplePdf + *pdf);
          if (config.USE_POWER_HEURISTIC == 1) {
            let b1 = (lightSamplePdf * cdfEntry.pdf);
            let b2 = brdfSamplePdf;
            *misWeight = (b1 * b1) / (b1 * b1 + b2 * b2);
          }

          let ires = bvhIntersect(*ray);
          let materialType = materialsData[ires.triangle.materialOffset];
          if (
            materialType == ${MATERIAL_TYPE.EMISSIVE} && 
            dot(triangle.normal, -lD) > 0
          ) {
            let material: Emissive = createEmissive(ires.triangle.materialOffset);
            let emissive = material.color * material.intensity;
            *lightSample = emissive;
          } else {
            *misWeight = 0;
          }
        }
      }

      fn shadeDiffuse(
        ires: BVHIntersectionResult, 
        ray: ptr<function, Ray>,
        reflectance: ptr<function, vec3f>, 
        rad: ptr<function, vec3f>,
        tid: vec3u,
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
          tid.y * canvasSize.x + tid.x +
          u32(cameraSample.x * 928373289 + cameraSample.y * 877973289) +
          u32(i * 17325799),
        );

        var brdf = 1 / PI;

        if (config.MIS_TYPE == BRDF_ONLY) {
          var pdf: f32; var w: f32;
          shadeDiffuseSampleBRDF(rands, N, ray, &pdf, &w);
          *reflectance *= brdf * (1 / pdf) * color * max(dot(N, (*ray).direction), 0.0);
        }

        if (config.MIS_TYPE == ONE_SAMPLE_MODEL) {
          var pdf: f32; var misWeight: f32; var ls: vec3f;
          if (rands.w < 0.5) {
            shadeDiffuseSampleBRDF(rands, N, ray, &pdf, &misWeight);
          } else {
            shadeDiffuseSampleLight(rands, N, ray, &pdf, &misWeight, &ls);
          }
          *reflectance *= brdf * (misWeight / pdf) * color * max(dot(N, (*ray).direction), 0.0);
        }

        if (config.MIS_TYPE == NEXT_EVENT_ESTIMATION) {
          var brdfSamplePdf: f32; var brdfMisWeight: f32; 
          var lightSamplePdf: f32; var lightMisWeight: f32; var lightSample: vec3f;
          var rayBrdf = Ray((*ray).origin, (*ray).direction);
          var rayLight = Ray((*ray).origin, (*ray).direction);

          shadeDiffuseSampleBRDF(rands, N, &rayBrdf, &brdfSamplePdf, &brdfMisWeight);
          shadeDiffuseSampleLight(rands, N, &rayLight, &lightSamplePdf, &lightMisWeight, &lightSample);

          (*ray).origin = rayBrdf.origin;
          (*ray).direction = rayBrdf.direction;

          *reflectance *= brdf * color;
          // light contribution
          *rad += lightSample * (lightMisWeight / lightSamplePdf) * (*reflectance) * max(dot(N, rayLight.direction), 0.0);
          *reflectance *= (brdfMisWeight / brdfSamplePdf) * max(dot(N, (*ray).direction), 0.0);
        }
      } 
    `;
  }
}
