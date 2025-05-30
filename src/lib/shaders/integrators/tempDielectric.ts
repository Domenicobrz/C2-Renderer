import { Dielectric } from '$lib/materials/dielectric';

export let tempDielectric = /* wgsl */ `

fn getDielectricMaterialData(
  surfaceAttributes: SurfaceAttributes, offset: u32
) -> EvaluatedMaterial {
  var data = EvaluatedMaterial();
  
  // material type
  data.materialType = u32(materialsBuffer[offset + 0]);

  // absorption 
  data.baseColor.x = materialsBuffer[offset + 1]; 
  data.baseColor.y = materialsBuffer[offset + 2]; 
  data.baseColor.z = materialsBuffer[offset + 3]; 

  // roughness, anisotropy
  data.roughness = materialsBuffer[offset + 4]; 
  data.anisotropy = materialsBuffer[offset + 5]; 

  // eta
  data.eta = materialsBuffer[offset + 6]; 

  // bump strength
  data.bumpStrength = materialsBuffer[offset + 7]; 

  data.uvRepeat = vec2f(
    materialsBuffer[offset + 8],
    materialsBuffer[offset + 9],
  );
  data.mapUvRepeat = vec2f(
    materialsBuffer[offset + 10],
    materialsBuffer[offset + 11],
  );

  data.roughnessMapLocation = vec2i(
    bitcast<i32>(materialsBuffer[offset + 14]),
    bitcast<i32>(materialsBuffer[offset + 15]),
  );
  data.bumpMapLocation = vec2i(
    bitcast<i32>(materialsBuffer[offset + 16]),
    bitcast<i32>(materialsBuffer[offset + 17]),
  );

  if (data.roughnessMapLocation.x > -1) {
    let roughnessTexel = getTexelFromTextureArrays(
      data.roughnessMapLocation, surfaceAttributes.uv, data.uvRepeat
    ).xy;

    // roughness
    data.roughness *= roughnessTexel.x;
    data.roughness = max(data.roughness, ${Dielectric.MIN_INPUT_ROUGHNESS});
  }

  let axay = anisotropyRemap(data.roughness, data.anisotropy);
  data.ax = axay.x;
  data.ay = axay.y;

  return data;
}

fn evaluatePdfDielectricLobe(
  wo: vec3f,
  wi: vec3f,
  materialData: EvaluatedMaterial, 
) -> f32 {
  let ax = materialData.ax;
  let ay = materialData.ay;
  let eta = materialData.eta;

  // we're assuming wo and wi are in local-space 
  var brdfSamplePdf = Dielectric_PDF(wo, wi, eta, ax, ay);
  return brdfSamplePdf;
}

fn evaluateDielectricBrdf(
  wo: vec3f,
  wi: vec3f,
  materialData: EvaluatedMaterial, 
) -> vec3f {
  let color = materialData.baseColor;
  let ax = materialData.ax;
  let ay = materialData.ay;
  let eta = materialData.eta;
  let roughness = materialData.roughness;

  // we're assuming wo and wi are in local-space 
  var brdf = Dielectric_f(wo, wi, eta, ax, ay);
  brdf /= dielectricMultiScatteringFactor(wo, roughness, eta);
  
  return brdf;
}

fn sampleDielectricBrdf(
  materialData: EvaluatedMaterial, 
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> BrdfDirectionSample {
  let rands = vec4f(getRand2D(), getRand2D());

  var tangent = vec3f(0.0);
  var bitangent = vec3f(0.0);
  getTangentFromTriangle(
    surfaceAttributes.tangent, surfaceNormals.geometric, surfaceNormals.shading, 
    &tangent, &bitangent
  );
  
  // https://learnopengl.com/Advanced-Lighting/Normal-Mapping
  let TBN = mat3x3f(tangent, bitangent, surfaceNormals.shading);
  // to transform vectors from world space to tangent space, we multiply by
  // the inverse of the TBN
  let TBNinverse = transpose(TBN);
  let wo = TBNinverse * -(*ray).direction;
  var wi = vec3f(0.0);

  let ax = materialData.ax;
  let ay = materialData.ay;
  let eta = materialData.eta;
  let roughness = materialData.roughness;

  var brdfSamplePdf = 0.0;
  var brdf = vec3f(0.0);
  Dielectric_Sample_f(wo, eta, ax, ay, rands, &wi, &brdfSamplePdf, &brdf);
  let msCompensation = dielectricMultiScatteringFactor(wo, roughness, eta);
  brdf /= msCompensation;
  
  let lightSamplePdf = getLightPDF(Ray((*ray).origin, normalize(TBN * wi)));
  let misWeight = getMisWeight(brdfSamplePdf, lightSamplePdf);
  let newDirection = normalize(TBN * wi);

  return BrdfDirectionSample(
    brdf,
    brdfSamplePdf,
    misWeight,
    newDirection,
  );
}

fn sampleDielectricLight(
  materialData: EvaluatedMaterial, 
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> LightDirectionSample {
  let rands = vec4f(getRand2D(), getRand2D());

  let lightSample = getLightSample(ray.origin, rands);
  let pdf = lightSample.pdf;

  var wo = -(*ray).direction;
  var wi = lightSample.direction;

  // from world-space to tangent-space
  transformToLocalSpace(&wo, &wi, surfaceAttributes, surfaceNormals);

  let ax = materialData.ax;
  let ay = materialData.ay;
  let eta = materialData.eta;
  let roughness = materialData.roughness;

  var brdfSamplePdf = Dielectric_PDF(wo, wi, eta, ax, ay);

  var brdf = Dielectric_f(wo, wi, eta, ax, ay);
  brdf /= dielectricMultiScatteringFactor(wo, roughness, eta);

  if (
    brdfSamplePdf == 0.0 || 
    lightSample.pdf == 0.0
  ) {
    return LightDirectionSample(
      vec3f(0.0),
      1,
      0,
      vec3f(0.0),
      lightSample,
    );
  }

  let mis = getMisWeight(lightSample.pdf, brdfSamplePdf);

  return LightDirectionSample(
    brdf,
    pdf,
    mis,
    lightSample.direction,
    lightSample
  );
}
`;
