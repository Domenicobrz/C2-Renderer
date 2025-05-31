import { Color, Vector2 } from 'three';
import { MATERIAL_TYPE, Material } from './material';
import { intBitsToFloat } from '$lib/utils/intBitsToFloat';

export class Diffuse extends Material {
  private color: Color;
  private bumpStrength: number;
  private uvRepeat: Vector2;
  private mapUvRepeat: Vector2;

  constructor({
    color,
    map,
    bumpMap,
    bumpStrength = 1,
    uvRepeat = new Vector2(1, 1),
    mapUvRepeat = new Vector2(1, 1),
    flipTextureY = false
  }: {
    color: Color;
    map?: HTMLImageElement;
    bumpMap?: HTMLImageElement;
    bumpStrength?: number;
    uvRepeat?: Vector2;
    mapUvRepeat?: Vector2;
    flipTextureY?: boolean;
  }) {
    super({ flipTextureY });
    this.type = MATERIAL_TYPE.DIFFUSE;
    this.color = color;
    this.bumpStrength = bumpStrength;
    this.uvRepeat = uvRepeat;
    this.mapUvRepeat = mapUvRepeat;
    this.offsetCount = 13;

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
      this.bumpStrength,
      this.uvRepeat.x,
      this.uvRepeat.y,
      this.mapUvRepeat.x,
      this.mapUvRepeat.y,
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
        bumpStrength: f32,
        uvRepeat: vec2f,
        mapUvRepeat: vec2f,
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
          materialsBuffer[offset + 1],
          materialsBuffer[offset + 2],
          materialsBuffer[offset + 3],
        );
        diffuse.bumpStrength = materialsBuffer[offset + 4];
        diffuse.uvRepeat.x = materialsBuffer[offset + 5];
        diffuse.uvRepeat.y = materialsBuffer[offset + 6];
        diffuse.mapUvRepeat.x = materialsBuffer[offset + 7];
        diffuse.mapUvRepeat.y = materialsBuffer[offset + 8];
        diffuse.mapLocation = vec2i(
          bitcast<i32>(materialsBuffer[offset + 9]),
          bitcast<i32>(materialsBuffer[offset + 10]),
        );
        diffuse.bumpMapLocation = vec2i(
          bitcast<i32>(materialsBuffer[offset + 11]),
          bitcast<i32>(materialsBuffer[offset + 12]),
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
        ires: BVHIntersectionResult
      ) {
        // uniform hemisphere sampling:
        // let rand_1 = rands.x;
        // let rand_2 = rands.y;
        // let phi = 2.0 * PI * rand_1;
        // let root = sqrt(1 - rand_2 * rand_2);
        // // local space new ray direction
        // let newDir = vec3f(cos(phi) * root, rand_2, sin(phi) * root);
        // var brdfSamplePdf = 1 / (2 * PI);

        // *********************************************************************
        // if you switch to another brdf pdf, remember to also update the light sample brdf's pdf
        // *********************************************************************
        // cosine-weighted hemisphere sampling:
        let rand_1 = rands.x;
        // if rand_2 is 0, both cosTheta and the pdf will be zero
        let rand_2 = max(rands.y, 0.000001);
        let phi = 2.0 * PI * rand_1;
        let theta = acos(sqrt(rand_2));
        let cosTheta = cos(theta);
        let sinTheta = sin(theta);
        // local space new ray direction
        let newDir = vec3f(cos(phi) * sinTheta, cosTheta, sin(phi) * sinTheta);
        var brdfSamplePdf = cosTheta / PI;

        var tangent = vec3f(0.0);
        var bitangent = vec3f(0.0);
        getTangentFromTriangle(ires.surfaceAttributes.tangent, ires.triangle.geometricNormal, N, &tangent, &bitangent);
      
        // https://learnopengl.com/Advanced-Lighting/Normal-Mapping
        let TBN = mat3x3f(tangent, bitangent, N);
        // from tangent space to world space
        (*ray).direction = normalize(TBN * newDir.xzy);

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

        let cosTheta = dot(lightSample.direction, N);
        var brdfSamplePdf = cosTheta / PI;
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
        lastBrdfMisWeight: ptr<function, f32>, 
        rad: ptr<function, vec3f>,
        tid: vec3u,
        i: i32
      ) {
        let hitPoint = ires.hitPoint;
        let material: Diffuse = createDiffuse(ires.triangle.materialOffset);

        var color = material.color;
        if (material.mapLocation.x > -1) {
          color *= getTexelFromTextureArrays(material.mapLocation, ires.surfaceAttributes.uv, material.mapUvRepeat).xyz;
        }

        var vertexNormal = ires.surfaceAttributes.normal;
        // the normal flip is calculated using the geometric normal to avoid
        // black edges on meshes displaying strong smooth-shading via vertex normals
        if (dot(ires.triangle.geometricNormal, (*ray).direction) > 0) {
          vertexNormal = -vertexNormal;
        }
        var N = vertexNormal;
        var bumpOffset: f32 = 0.0;
        if (material.bumpMapLocation.x > -1) {

          let surfAttrWithFlippedNormal = SurfaceAttributes(N, ires.surfaceAttributes.uv, ires.surfaceAttributes.tangent);
          N = getShadingNormal(
            material.bumpMapLocation, material.bumpStrength, material.uvRepeat, surfAttrWithFlippedNormal, *ray, 
            ires.triangle, &bumpOffset
          );
        }

        // needs to be the exact origin, such that getLightSample/getLightPDF can apply a proper offset 
        (*ray).origin = ires.hitPoint;
        // in practice however, only for Dielectrics we need the exact origin, 
        // for Diffuse we can apply the bump offset if necessary
        if (bumpOffset > 0.0) {
          (*ray).origin += vertexNormal * bumpOffset;
        }
    
        // rands1.xy is used for brdf samples
        // rands2.xyz is used for light samples (getLightSample(...) uses .xyz)
        let rands1 = vec4f(getRand2D(), getRand2D());
        let rands2 = vec4f(getRand2D(), getRand2D());

        var brdf = color / PI;

        if (config.MIS_TYPE == BRDF_ONLY) {
          var pdf: f32; var w: f32;
          shadeDiffuseSampleBRDF(rands1, N, ray, &pdf, &w, ires);
          (*ray).origin += (*ray).direction * 0.001;
          *reflectance *= brdf * (1 / pdf) * max(dot(N, (*ray).direction), 0.0);
          *lastBrdfMisWeight = 1.0;
        }

        if (config.MIS_TYPE == NEXT_EVENT_ESTIMATION) {
          var brdfSamplePdf: f32; var brdfMisWeight: f32; 
          var lightSamplePdf: f32; var lightMisWeight: f32; var lightSampleRadiance: vec3f;
          var rayBrdf = Ray((*ray).origin, (*ray).direction);
          var rayLight = Ray((*ray).origin, (*ray).direction);

          // the reason why we're guarding NEE with this if statement is explained in the segment/integrators/mis-explanation.png
          if (debugInfo.bounce < config.BOUNCES_COUNT - 1) {
            // light contribution
            shadeDiffuseSampleLight(rands2, N, &rayLight, &lightSamplePdf, &lightMisWeight, &lightSampleRadiance);
            *rad += brdf * lightSampleRadiance * (lightMisWeight / lightSamplePdf) * (*reflectance) * max(dot(N, rayLight.direction), 0.0);
          }

          shadeDiffuseSampleBRDF(rands1, N, &rayBrdf, &brdfSamplePdf, &brdfMisWeight, ires);
          (*ray).origin += rayBrdf.direction * 0.001;
          (*ray).direction = rayBrdf.direction;

          *lastBrdfMisWeight = brdfMisWeight;
          *reflectance *= brdf * (1.0 / brdfSamplePdf) * max(dot(N, rayBrdf.direction), 0.0);    
        }
      }
    `;
  }
}
