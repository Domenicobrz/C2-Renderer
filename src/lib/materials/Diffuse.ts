import { Color, Vector2 } from 'three';
import { MATERIAL_TYPE, Material } from './material';
import { intBitsToFloat } from '$lib/utils/intBitsToFloat';

export class Diffuse extends Material {
  private color: Color;

  constructor(color: Color, map?: HTMLImageElement, bumpMap?: HTMLImageElement) {
    super();
    this.type = MATERIAL_TYPE.DIFFUSE;
    this.color = color;
    this.offsetCount = 8;

    this.texturesLocation.map = new Vector2(-1, -1);
    this.texturesLocation.bumpMap = new Vector2(-1, -1);
    if (map) {
      this.textures.map = map;
    }
    if (bumpMap) {
      this.textures.bumpMap = bumpMap;
    }
  }

  getFloatsArray(): number[] {
    return [
      this.type,
      this.color.r,
      this.color.g,
      this.color.b,
      // we'll store integers as floats and then bitcast them back into ints
      intBitsToFloat(this.texturesLocation.map.x),
      intBitsToFloat(this.texturesLocation.map.y),
      intBitsToFloat(this.texturesLocation.bumpMap.x),
      intBitsToFloat(this.texturesLocation.bumpMap.y)
    ];
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct Diffuse {
        color: vec3f,
        mapLocation: vec2i,
        bumpMapLocation: vec2i,
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
        diffuse.mapLocation = vec2i(
          bitcast<i32>(materialsData[offset + 4]),
          bitcast<i32>(materialsData[offset + 5]),
        );
        diffuse.bumpMapLocation = vec2i(
          bitcast<i32>(materialsData[offset + 6]),
          bitcast<i32>(materialsData[offset + 7]),
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
        // local space new ray direction
        let newDir = vec3f(cos(phi) * root, rand_2, sin(phi) * root);

        var brdfSamplePdf = 1 / (2 * PI);

        var Nt = vec3f(0,0,0);
        var Nb = vec3f(0,0,0);
        getCoordinateSystem(N, &Nt, &Nb);
    
        // back to world space
        (*ray).direction = normalize(Nt * newDir.x + N * newDir.y + Nb * newDir.z);
        
        *pdf = brdfSamplePdf;
        let lightSamplePdf = getLightPDF(*ray);
        *misWeight = getMisWeight(brdfSamplePdf, lightSamplePdf);
      }

      fn shadeDiffuseSampleLight(
        rands: vec4f, 
        N: vec3f,
        ray: ptr<function, Ray>, 
        pdf: ptr<function, f32>,
        misWeight: ptr<function, f32>,
        lightSampleRadiance: ptr<function, vec3f>,
      ) {
        let lightSample = getLightSample(ray.origin, rands);
        *pdf = lightSample.pdf;
        let backSideHit = lightSample.backSideHit;

        (*ray).direction = lightSample.direction;

        var brdfSamplePdf = 1 / (2 * PI);
        // if the sampled ray sits below the hemisphere, brdfSamplePdf is zero,
        // since diffuse materials never sample a direction under the hemisphere.
        // However at this point, it doesn't even make sense to evaluate the 
        // rest of this function since we would be wasting a sample, thus we'll return
        // misWeight = 0 instead.
        if (
          dot((*ray).direction, N) < 0.0 ||
          lightSample.pdf == 0.0
        ) {
          brdfSamplePdf = 0;
          *misWeight = 0; *pdf = 1; 
          *lightSampleRadiance = vec3f(0.0);
          return;
        }

        *lightSampleRadiance = lightSample.radiance;
        *misWeight = getMisWeight(lightSample.pdf, brdfSamplePdf);
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

        var color = material.color;
        if (material.mapLocation.x > -1) {
          color *= getTexelFromTextureArrays(material.mapLocation, ires.uv).xyz;
        }

        var geometricNormal = ires.triangle.normal;
        if (dot(geometricNormal, (*ray).direction) > 0) {
          geometricNormal = -geometricNormal;
        }
        var N = geometricNormal;
        var bumpOffset: f32 = 0.0;
        if (material.bumpMapLocation.x > -1) {
          N = getShadingNormal(
            material.bumpMapLocation, 6.0, N, *ray, ires.hitPoint, ires.uv, ires.triangle, &bumpOffset
          );
        }
    
        // needs to be the exact origin, such that getLightSample/getLightPDF can apply a proper offset 
        (*ray).origin = ires.hitPoint;
        // in practice however, only for Dielectrics we need the exact origin, 
        // for Diffuse we can apply the bump offset if necessary
        if (bumpOffset > 0.0) {
          (*ray).origin += geometricNormal * bumpOffset;
        }
    
        // rands1.w is used for ONE_SAMPLE_MODEL
        // rands1.xy is used for brdf samples
        // rands2.xyz is used for light samples (getLightSample(...) uses .xyz)
        let rands1 = rand4(
          tid.y * canvasSize.x + tid.x +
          u32(cameraSamples.a.x * 928373289 + cameraSamples.a.y * 877973289) +
          u32(i * 17325799),
        );
        let rands2 = rand4(
          tid.y * canvasSize.x + tid.x + 148789 +
          u32(cameraSamples.a.z * 597834279 + cameraSamples.a.w * 34219873) +
          u32(i * 86210973),
        );

        var brdf = 1 / PI;

        if (config.MIS_TYPE == BRDF_ONLY) {
          var pdf: f32; var w: f32;
          shadeDiffuseSampleBRDF(rands1, N, ray, &pdf, &w);
          (*ray).origin = ires.hitPoint + (*ray).direction * 0.001;
          *reflectance *= brdf * (1 / pdf) * color * max(dot(N, (*ray).direction), 0.0);
        }

        if (config.MIS_TYPE == ONE_SAMPLE_MODEL) {
          var pdf: f32; var misWeight: f32; var ls: vec3f;
          let isBrdfSample = rands1.w < 0.5;
          if (isBrdfSample) {
            shadeDiffuseSampleBRDF(rands1, N, ray, &pdf, &misWeight);
          } else {
            shadeDiffuseSampleLight(rands2, N, ray, &pdf, &misWeight, &ls);          
          }
          (*ray).origin = ires.hitPoint + (*ray).direction * 0.001;
          *reflectance *= brdf * (misWeight / pdf) * color * max(dot(N, (*ray).direction), 0.0);
        }

        if (config.MIS_TYPE == NEXT_EVENT_ESTIMATION) {
          var brdfSamplePdf: f32; var brdfMisWeight: f32; 
          var lightSamplePdf: f32; var lightMisWeight: f32; var lightSampleRadiance: vec3f;
          var rayBrdf = Ray((*ray).origin, (*ray).direction);
          var rayLight = Ray((*ray).origin, (*ray).direction);

          shadeDiffuseSampleBRDF(rands1, N, &rayBrdf, &brdfSamplePdf, &brdfMisWeight);
          shadeDiffuseSampleLight(rands2, N, &rayLight, &lightSamplePdf, &lightMisWeight, &lightSampleRadiance);

          (*ray).origin = rayBrdf.origin + rayBrdf.direction * 0.001;
          (*ray).direction = rayBrdf.direction;

          // light contribution
          *rad += color * brdf * lightSampleRadiance * (lightMisWeight / lightSamplePdf) * (*reflectance) * max(dot(N, rayLight.direction), 0.0);
          *reflectance *= color * brdf * (brdfMisWeight / brdfSamplePdf) * max(dot(N, rayBrdf.direction), 0.0);
        }
      }
    `;
  }
}
