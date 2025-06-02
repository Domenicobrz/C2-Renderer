import type { Color } from 'three';
import { MATERIAL_TYPE, Material } from './material';
import type { IntegratorType } from '$lib/config';

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
          materialsBuffer[offset + 1],
          materialsBuffer[offset + 2],
          materialsBuffer[offset + 3],
        );
        emissive.intensity = materialsBuffer[offset + 4];

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
        lastBrdfMisWeight: ptr<function, f32>, 
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
          // another way of handling this, that does not involve the usage of 
          // an else statement, is to set the emissive to vec3f(0.0) if the
          // triangle is back facing
          *rad += emissive * *lastBrdfMisWeight * *reflectance;
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
        getTangentFromTriangle(ires.surfaceAttributes.tangent, ires.triangle.geometricNormal, N, &tangent, &bitangent);
      
        // https://learnopengl.com/Advanced-Lighting/Normal-Mapping
        let TBN = mat3x3f(tangent, bitangent, N);
        // from tangent space to world space
        (*ray).direction = normalize(TBN * nd.xzy);

        *reflectance *= albedo * max(dot(N, (*ray).direction), 0.0) * (1 / PI) * (2 * PI);
        *lastBrdfMisWeight = 1.0;
      } 
    `;
  }

  static shaderEmissiveLobe(): string {
    return /* wgsl */ `
fn getEmissiveMaterial(offset: u32) -> EvaluatedMaterial {
  var data = EvaluatedMaterial();
  
  // material type
  data.materialType = u32(materialsBuffer[offset]);

  // color
  data.baseColor.x = materialsBuffer[offset + 1];
  data.baseColor.y = materialsBuffer[offset + 2];
  data.baseColor.z = materialsBuffer[offset + 3];

  // intensity
  data.emissiveIntensity = materialsBuffer[offset + 4];

  data.roughnessMapLocation = vec2i(-1, -1);
  data.bumpMapLocation = vec2i(-1, -1);
  data.mapLocation = vec2i(-1, -1);

  return data;
}


fn evaluatePdfEmissiveLobe() -> f32 {
  return 1 / (2 * PI);
}

fn evaluateEmissiveBrdf() -> vec3f {
  return vec3f(1 / PI);
}

fn sampleEmissiveBrdf(
  material: EvaluatedMaterial, 
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> BrdfDirectionSample {
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
  getTangentFromTriangle(
    surfaceAttributes.tangent, surfaceNormals.geometric, surfaceNormals.shading, 
    &tangent, &bitangent
  );

  // https://learnopengl.com/Advanced-Lighting/Normal-Mapping
  let TBN = mat3x3f(tangent, bitangent, surfaceNormals.shading);
  // from tangent space to world space
  let newDirection = normalize(TBN * nd.xzy);
  let brdfSamplePdf = evaluatePdfEmissiveLobe();
  let brdf = evaluateEmissiveBrdf();
  const misWeight = 1.0;

  return BrdfDirectionSample(
    brdf,
    brdfSamplePdf,
    misWeight,
    newDirection,
  );
}

fn sampleEmissiveLight(
  material: EvaluatedMaterial, 
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> LightDirectionSample {
  // necessary to use the same number of rands between this function and sampleDiffuseLight
  let rands = vec4f(getRand2D(), getRand2D());
  
  return LightDirectionSample(
    vec3f(0.0),
    1,
    0,
    vec3f(0.0),
    LightSample(),
  );
}
    `;
  }
}
