import { TorranceSparrow } from '$lib/materials/torranceSparrow';

export let tempTorranceSparrow = /* wgsl */ `

fn getTSMaterialData(
  surfaceAttributes: SurfaceAttributes, offset: u32
) -> EvaluatedMaterial {
  var data = EvaluatedMaterial();
  
  // material type
  data.materialType = u32(materialsBuffer[offset + 0]);

  // color 
  data.baseColor.x = materialsBuffer[offset + 1]; 
  data.baseColor.y = materialsBuffer[offset + 2]; 
  data.baseColor.z = materialsBuffer[offset + 3]; 

  // bump strength
  data.bumpStrength = materialsBuffer[offset + 6]; 

  // uvRepeat, used for bumpMapping
  data.uvRepeat.x = materialsBuffer[offset + 7];
  data.uvRepeat.y = materialsBuffer[offset + 8];

  // bumpMapLocation, used for bumpMapping
  data.bumpMapLocation.x = bitcast<i32>(materialsBuffer[offset + 15]);
  data.bumpMapLocation.y = bitcast<i32>(materialsBuffer[offset + 16]);

  // roughness, anisotropy
  data.roughness = materialsBuffer[offset + 4]; 
  data.anisotropy = materialsBuffer[offset + 5]; 

  data.uvRepeat = vec2f(
    materialsBuffer[offset + 7],
    materialsBuffer[offset + 8],
  );
  data.mapUvRepeat = vec2f(
    materialsBuffer[offset + 9],
    materialsBuffer[offset + 10],
  );

  data.mapLocation = vec2i(
    bitcast<i32>(materialsBuffer[offset + 11]),
    bitcast<i32>(materialsBuffer[offset + 12]),
  );
  data.roughnessMapLocation = vec2i(
    bitcast<i32>(materialsBuffer[offset + 13]),
    bitcast<i32>(materialsBuffer[offset + 14]),
  );
  data.bumpMapLocation = vec2i(
    bitcast<i32>(materialsBuffer[offset + 15]),
    bitcast<i32>(materialsBuffer[offset + 16]),
  );

  if (data.mapLocation.x > -1) {
    let texelColor = getTexelFromTextureArrays(
      data.mapLocation, surfaceAttributes.uv, data.mapUvRepeat
    ).xyz;

    // color
    data.baseColor *= texelColor;
  }
  if (data.roughnessMapLocation.x > -1) {
    let roughnessTexel = getTexelFromTextureArrays(
      data.roughnessMapLocation, surfaceAttributes.uv, data.uvRepeat
    ).xy;

    // roughness
    data.roughness *= roughnessTexel.x;
    data.roughness = max(data.roughness, ${TorranceSparrow.MIN_INPUT_ROUGHNESS});
  }

  let axay = anisotropyRemap(data.roughness, data.anisotropy);
  data.ax = axay.x;
  data.ay = axay.y;

  return data;
}

fn evaluatePdfTSLobe(
  wo: vec3f,
  wi: vec3f,
  materialData: EvaluatedMaterial, 
) -> f32 {
  let ax = materialData.ax;
  let ay = materialData.ay;

  // we're assuming wo and wi are in local-space 
  var brdfSamplePdf = TS_PDF(wo, wi, ax, ay);

  return brdfSamplePdf;
}

fn evaluateTSBrdf(
  wo: vec3f,
  wi: vec3f,
  materialData: EvaluatedMaterial, 
) -> vec3f {
  let color = materialData.baseColor;
  let ax = materialData.ax;
  let ay = materialData.ay;
  let roughness = materialData.roughness;

  // we're assuming wo and wi are in local-space 
  var brdf = TS_f(wo, wi, ax, ay, color);
  brdf *= multiScatterCompensationTorranceSparrow(color, wo, roughness);
  
  return brdf;
}

fn sampleTSBrdf(
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

  let color = materialData.baseColor;
  let ax = materialData.ax;
  let ay = materialData.ay;
  let roughness = materialData.roughness;

  var brdfSamplePdf = 0.0;
  var brdf = vec3f(0.0);
  TS_Sample_f(wo, rands.xy, ax, ay, color, &wi, &brdfSamplePdf, &brdf);
  brdf *= multiScatterCompensationTorranceSparrow(color, wo, roughness);
  
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

fn sampleTSLight(
  materialData: EvaluatedMaterial, 
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> LightDirectionSample {
  let rands = vec4f(getRand2D(), getRand2D());

  let lightSample = getLightSample(ray.origin, rands);
  let pdf = lightSample.pdf;
  let backSideHit = lightSample.backSideHit;

  var wo = -(*ray).direction;
  var wi = lightSample.direction;

  // from world-space to tangent-space
  transformToLocalSpace(&wo, &wi, surfaceAttributes, surfaceNormals);

  let color = materialData.baseColor;
  let ax = materialData.ax;
  let ay = materialData.ay;
  let roughness = materialData.roughness;

  var brdfSamplePdf = TS_PDF(wo, wi, ax, ay);
  var brdf = TS_f(wo, wi, ax, ay, color);
  brdf *= multiScatterCompensationTorranceSparrow(color, wo, roughness);

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
