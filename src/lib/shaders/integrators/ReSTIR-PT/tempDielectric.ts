import { Dielectric } from '$lib/materials/dielectric';

export let tempDielectric = /* wgsl */ `

fn getDielectricMaterial(
  surfaceAttributes: SurfaceAttributes, offset: u32
) -> EvaluatedMaterial {
  var data = EvaluatedMaterial();
  
  // material type
  data.materialType = u32(materialsBuffer[offset + 0]);

  data.baseColor = vec3f(1.0);

  // absorption 
  data.absorptionCoefficient.x = materialsBuffer[offset + 1]; 
  data.absorptionCoefficient.y = materialsBuffer[offset + 2]; 
  data.absorptionCoefficient.z = materialsBuffer[offset + 3]; 

  data.emissiveIntensity = 0.0;

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

  data.mapLocation = vec2i(-1, -1);
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
  material: EvaluatedMaterial, 
) -> f32 {
  let ax = material.ax;
  let ay = material.ay;
  let eta = material.eta;

  // we're assuming wo and wi are in local-space 
  var brdfSamplePdf = Dielectric_PDF(wo, wi, eta, ax, ay);
  return brdfSamplePdf;
}

fn evaluateDielectricBrdf(
  wo: vec3f,
  wi: vec3f,
  material: EvaluatedMaterial, 
) -> vec3f {
  let ax = material.ax;
  let ay = material.ay;
  let eta = material.eta;
  let roughness = material.roughness;

  // we're assuming wo and wi are in local-space 
  var brdf = Dielectric_f(wo, wi, eta, ax, ay);
  brdf /= dielectricMultiScatteringFactor(wo, roughness, eta);
  
  return brdf;
}

fn sampleDielectricBrdf(
  material: EvaluatedMaterial, 
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

  let ax = material.ax;
  let ay = material.ay;
  let eta = material.eta;
  let roughness = material.roughness;

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
  material: EvaluatedMaterial, 
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

  let ax = material.ax;
  let ay = material.ay;
  let eta = material.eta;
  let roughness = material.roughness;

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
