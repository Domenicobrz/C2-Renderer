import { MATERIAL_TYPE } from '$lib/materials/material';

export const misPart = /* wgsl */ `
  fn surfaceSampleMisWeight(
    surfaceSamplePdf: f32, 
    ray: Ray,
    misWeight: ptr<function, f32>,
  ) {
    if (config.MIS_TYPE == ONE_SAMPLE_MODEL || config.MIS_TYPE == NEXT_EVENT_ESTIMATION) {
      let lightSamplePdf = getLightPDF(ray);  

      if (config.MIS_TYPE == ONE_SAMPLE_MODEL) {
        *misWeight = surfaceSamplePdf / ((surfaceSamplePdf + lightSamplePdf) * 0.5);
        if (config.USE_POWER_HEURISTIC == 1) {
          let b1 = surfaceSamplePdf;
          let b2 = lightSamplePdf;
          *misWeight = (b1 * b1) / ((b1 * b1 + b2 * b2) * 0.5);
        }
      }

      if (config.MIS_TYPE == NEXT_EVENT_ESTIMATION) {
        *misWeight = surfaceSamplePdf / (surfaceSamplePdf + lightSamplePdf);
        if (config.USE_POWER_HEURISTIC == 1) {
          let b1 = surfaceSamplePdf;
          let b2 = lightSamplePdf;
          *misWeight = (b1 * b1) / (b1 * b1 + b2 * b2);
        }
      }
    }
  }

  fn lightSampleMisWeight(
    ray: Ray,
    surfaceSamplePdf: f32,
    lightSample: LightSample,
    lightSamplePdf: ptr<function, f32>, 
    lightSampleRadiance: ptr<function, vec3f>,
    misWeight: ptr<function, f32>,
  ) {
    let backSideHit = lightSample.backSideHit;
    
    if (config.MIS_TYPE == NEXT_EVENT_ESTIMATION || config.MIS_TYPE == ONE_SAMPLE_MODEL) {
      if (config.MIS_TYPE == ONE_SAMPLE_MODEL) {
        *misWeight = *lightSamplePdf / ((surfaceSamplePdf + *lightSamplePdf) * 0.5);
        if (config.USE_POWER_HEURISTIC == 1) {
          let b1 = *lightSamplePdf;
          let b2 = surfaceSamplePdf;
          *misWeight = (b1 * b1) / ((b1 * b1 + b2 * b2) * 0.5);
        }
      }
      
      if (config.MIS_TYPE == NEXT_EVENT_ESTIMATION) {
        *misWeight = *lightSamplePdf / (surfaceSamplePdf + *lightSamplePdf);
        if (config.USE_POWER_HEURISTIC == 1) {
          let b1 = *lightSamplePdf;
          let b2 = surfaceSamplePdf;
          *misWeight = (b1 * b1) / (b1 * b1 + b2 * b2);
        }
      }

      // TODO:
      // to be consistent, I think I should check if we're hitting the same
      // identical light source triangle
      let ires = bvhIntersect(ray);
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
          *misWeight = 0; *lightSamplePdf = 1; 
          *lightSampleRadiance = vec3f(0.0);
        }
      } else if (!ires.hit && lightSample.isEnvmap) {
        *lightSampleRadiance = getEnvmapRadiance(lightSample.direction);
      } else {
        *misWeight = 0; *lightSamplePdf = 1; 
        *lightSampleRadiance = vec3f(0.0);
      }
    }
  }
`;
