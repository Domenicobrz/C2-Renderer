import { TorranceSparrow } from '$lib/materials/torranceSparrow';

export let tempTorranceSparrow = /* wgsl */ `

fn getTSMaterialData(
  surfaceAttributes: SurfaceAttributes, offset: u32
) -> array<f32, MATERIAL_DATA_ELEMENTS> {
  var data = array<f32,MATERIAL_DATA_ELEMENTS>();
  
  // material type
  data[0] = materialsData[offset + 0];

  // color 
  data[1] = materialsData[offset + 1]; 
  data[2] = materialsData[offset + 2]; 
  data[3] = materialsData[offset + 3]; 

  // ax, ay, assigned later in this function
  data[4] = 0; 
  data[5] = 0;

  // roughness, anisotropy
  var roughness = materialsData[offset + 4]; 
  let anisotropy = materialsData[offset + 5]; 

  // bump strength
  data[6] = materialsData[offset + 6]; 

  // will be used for roughness, since it's used in the multiscattering func
  data[7] = 0.0;

  let uvRepeat = vec2f(
    materialsData[offset + 7],
    materialsData[offset + 8],
  );
  let mapUvRepeat = vec2f(
    materialsData[offset + 9],
    materialsData[offset + 10],
  );

  let mapLocation = vec2i(
    bitcast<i32>(materialsData[offset + 11]),
    bitcast<i32>(materialsData[offset + 12]),
  );
  let roughnessMapLocation = vec2i(
    bitcast<i32>(materialsData[offset + 13]),
    bitcast<i32>(materialsData[offset + 14]),
  );
  let bumpMapLocation = vec2i(
    bitcast<i32>(materialsData[offset + 15]),
    bitcast<i32>(materialsData[offset + 16]),
  );

  if (mapLocation.x > -1) {
    let texelColor = getTexelFromTextureArrays(
      mapLocation, surfaceAttributes.uv, mapUvRepeat
    ).xyz;

    // color
    data[1] *= texelColor.x;
    data[2] *= texelColor.y;
    data[3] *= texelColor.z;
  }
  if (roughnessMapLocation.x > -1) {
    let roughnessTexel = getTexelFromTextureArrays(
      roughnessMapLocation, surfaceAttributes.uv, uvRepeat
    ).xy;

    // roughness
    roughness *= roughnessTexel.x;
    roughness = max(roughness, ${TorranceSparrow.MIN_INPUT_ROUGHNESS});
  }

  let axay = anisotropyRemap(roughness, anisotropy);
  data[4] = axay.x;
  data[5] = axay.y;
  data[7] = roughness;

  return data;
}

fn evaluatePdfTSLobe(
  wo: vec3f,
  wi: vec3f,
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>, 
) -> f32 {
  let ax = materialData[4];
  let ay = materialData[5];

  // we're assuming wo and wi are in local-space 
  var brdfSamplePdf = TS_PDF(wo, wi, ax, ay);

  return brdfSamplePdf;
}

fn evaluateTSBrdf(
  wo: vec3f,
  wi: vec3f,
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>, 
) -> vec3f {
  let color = vec3f(materialData[1], materialData[2], materialData[3]);
  let ax = materialData[4];
  let ay = materialData[5];

  // we're assuming wo and wi are in local-space 
  let brdf = TS_f(wo, wi, ax, ay, color);
  return brdf;
}

fn sampleTSBrdf(
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>, 
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

  let color = vec3f(materialData[1], materialData[2], materialData[3]);
  let ax = materialData[4];
  let ay = materialData[5];
  let roughness = materialData[7];

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
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>, 
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

  let color = vec3f(materialData[1], materialData[2], materialData[3]);
  let ax = materialData[4];
  let ay = materialData[5];
  let roughness = materialData[7];

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
