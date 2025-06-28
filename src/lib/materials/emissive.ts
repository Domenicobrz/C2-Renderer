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
  geometryContext: GeometryContext
) -> BrdfDirectionSample {
  let surfaceNormals = geometryContext.normals;

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
  getTangentFromTriangle(geometryContext, &tangent, &bitangent);

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
  geometryContext: GeometryContext
) -> LightDirectionSample {
  let ray = geometryContext.ray;
  let interpolatedAttributes = geometryContext.interpolatedAttributes;
  let surfaceNormals = geometryContext.normals;
  
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
