import type { Color } from 'three';
import { MATERIAL_TYPE, Material } from './material';

export class Diffuse extends Material {
  private color: Color;

  constructor(color: Color) {
    super();
    this.type = MATERIAL_TYPE.DIFFUSE;
    this.color = color;
    this.offsetCount = 4;
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
          let lightSamplePdf = getLightPDF(ray);  

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
        lightSampleRadiance: ptr<function, vec3f>,
      ) {
        let lightSample = getLightSample(ray, rands);
        let lightSamplePdf = lightSample.pdf;
        let backSideHit = lightSample.backSideHit;

        (*ray).direction = lightSample.direction;

        var brdfSamplePdf = 1 / (2 * PI);
        // if the sampled ray sits below the hemisphere, brdfSamplePdf is zero,
        // since diffuse materials never sample a direction under the hemisphere.
        // However at this point, it doesn't even make sense to evaluate the 
        // rest of this function since we would be wasting a sample, thus we'll return
        // misWeight = 0 instead.
        if (dot((*ray).direction, N) < 0.0) {
          brdfSamplePdf = 0;
          *misWeight = 0; *pdf = 1; 
          return;
        }

        if (config.MIS_TYPE == ONE_SAMPLE_MODEL) {
          *pdf = lightSamplePdf;
          *misWeight = *pdf / ((brdfSamplePdf + *pdf) * 0.5);
          if (config.USE_POWER_HEURISTIC == 1) {
            let b1 = lightSamplePdf;
            let b2 = brdfSamplePdf;
            *misWeight = (b1 * b1) / ((b1 * b1 + b2 * b2) * 0.5);
          }

          if (backSideHit) {
            *misWeight = 0.0;
          }
        }

        if (config.MIS_TYPE == NEXT_EVENT_ESTIMATION) {
          *pdf = lightSamplePdf;
          *misWeight = *pdf / (brdfSamplePdf + *pdf);
          if (config.USE_POWER_HEURISTIC == 1) {
            let b1 = lightSamplePdf;
            let b2 = brdfSamplePdf;
            *misWeight = (b1 * b1) / (b1 * b1 + b2 * b2);
          }

          // I wonder if we should check wheter it's the same triangle or not
          // since the light sampling routine might hit a different light source from ours here
          // I can probably construct cases where this could be a problem
          let ires = bvhIntersect(*ray);
          if (ires.hit && !lightSample.isEnvmap) {
            let materialType = materialsData[ires.triangle.materialOffset];
            if (
              materialType == ${MATERIAL_TYPE.EMISSIVE} && 
              !backSideHit
            ) {
              let material: Emissive = createEmissive(ires.triangle.materialOffset);
              let emissive = material.color * material.intensity;
              *lightSampleRadiance = emissive;
            } else {
              *misWeight = 0;
            }
          } else if (!ires.hit && lightSample.isEnvmap) {
            *lightSampleRadiance = getEnvmapRadiance((*ray).direction);
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
    
        // rands1.w is used for ONE_SAMPLE_MODEL
        // rands1.xy is used for brdf samples
        // rands2.xyz is used for light samples (getLightSample(...) uses .xyz)
        let rands1 = rand4(
          tid.y * canvasSize.x + tid.x +
          u32(cameraSample.x * 928373289 + cameraSample.y * 877973289) +
          u32(i * 17325799),
        );
        let rands2 = rand4(
          tid.y * canvasSize.x + tid.x + 148789 +
          u32(cameraSample.x * 597834279 + cameraSample.y * 34219873) +
          u32(i * 86210973),
        );

        var brdf = 1 / PI;

        if (config.MIS_TYPE == BRDF_ONLY) {
          var pdf: f32; var w: f32;
          shadeDiffuseSampleBRDF(rands1, N, ray, &pdf, &w);
          *reflectance *= brdf * (1 / pdf) * color * max(dot(N, (*ray).direction), 0.0);
        }

        if (config.MIS_TYPE == ONE_SAMPLE_MODEL) {
          var pdf: f32; var misWeight: f32; var ls: vec3f;
          if (rands1.w < 0.5) {
            shadeDiffuseSampleBRDF(rands1, N, ray, &pdf, &misWeight);
          } else {
            shadeDiffuseSampleLight(rands2, N, ray, &pdf, &misWeight, &ls);
          }
          *reflectance *= brdf * (misWeight / pdf) * color * max(dot(N, (*ray).direction), 0.0);
        }

        if (config.MIS_TYPE == NEXT_EVENT_ESTIMATION) {
          var brdfSamplePdf: f32; var brdfMisWeight: f32; 
          var lightSamplePdf: f32; var lightMisWeight: f32; var lightSampleRadiance: vec3f;
          var rayBrdf = Ray((*ray).origin, (*ray).direction);
          var rayLight = Ray((*ray).origin, (*ray).direction);

          shadeDiffuseSampleBRDF(rands1, N, &rayBrdf, &brdfSamplePdf, &brdfMisWeight);
          shadeDiffuseSampleLight(rands2, N, &rayLight, &lightSamplePdf, &lightMisWeight, &lightSampleRadiance);

          (*ray).origin = rayBrdf.origin;
          (*ray).direction = rayBrdf.direction;

          *reflectance *= brdf * color;
          // light contribution
          *rad += lightSampleRadiance * (lightMisWeight / lightSamplePdf) * (*reflectance) * max(dot(N, rayLight.direction), 0.0);
          *reflectance *= (brdfMisWeight / brdfSamplePdf) * max(dot(N, rayBrdf.direction), 0.0);
        }
      } 
    `;
  }
}
