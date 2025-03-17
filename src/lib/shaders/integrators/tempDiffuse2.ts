export let tempDiffuse2 = /* wgsl */ `
fn evaluatePdfDiffuseLobe(
  wi: vec3f,
  surfaceNormals: SurfaceNormals,
) -> f32 {
  // assuming wi is in local-space
  let cosTheta = wi.z;
  let brdfSamplePdf = cosTheta / PI;
  return brdfSamplePdf;
}

fn evaluateDiffuseBrdf(
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>, 
  surfaceAttributes: SurfaceAttributes,
) -> vec3f {
  var color = vec3f(materialData[1], materialData[2], materialData[3]);
  let mapLocation = vec2i(
    bitcast<i32>(materialData[9]),
    bitcast<i32>(materialData[10]),
  );
  let mapUvRepeat = vec2f(materialData[7], materialData[8]);
  if (mapLocation.x > -1) {
    color *= getTexelFromTextureArrays(mapLocation, surfaceAttributes.uv, mapUvRepeat).xyz;
  }

  let brdf = color / PI;
  return brdf;
}

fn sampleDiffuseBrdf(
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>, 
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> BrdfDirectionSample {
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
  let rands = vec4f(getRand2D(), getRand2D());
  let rand_1 = rands.x;
  // if rand_2 is 0, both cosTheta and the pdf will be zero
  let rand_2 = max(rands.y, 0.000001);
  let phi = 2.0 * PI * rand_1;
  let theta = acos(sqrt(rand_2));
  let cosTheta = cos(theta);
  let sinTheta = sin(theta);
  // local space new ray direction. Z points up to follow pbrt's convention
  let newDir = vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  var tangent = vec3f(0.0);
  var bitangent = vec3f(0.0);
  getTangentFromTriangle(
    surfaceAttributes.tangent, surfaceNormals.geometric, surfaceNormals.shading, 
    &tangent, &bitangent
  );
  
  // https://learnopengl.com/Advanced-Lighting/Normal-Mapping
  let TBN = mat3x3f(tangent, bitangent, surfaceNormals.shading);

  // from tangent space to world space
  let newDirection = normalize(TBN * newDir);

  let brdf = evaluateDiffuseBrdf(materialData, surfaceAttributes);
  var brdfSamplePdf = evaluatePdfDiffuseLobe(newDir, surfaceNormals);

  let lightSamplePdf = getLightPDF(Ray((*ray).origin, newDirection));
  let misWeight = getMisWeight(brdfSamplePdf, lightSamplePdf);

  return BrdfDirectionSample(
    brdf,
    brdfSamplePdf,
    misWeight,
    newDirection,
  );
}

fn sampleDiffuseLight(
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>, 
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> LightDirectionSample {
  let rands = vec4f(getRand2D(), getRand2D());
  let lightSample = getLightSample(ray.origin, rands);
  let pdf = lightSample.pdf;
  let backSideHit = lightSample.backSideHit;

  let newDirection = lightSample.direction;

  // if the sampled ray sits below the hemisphere, brdfSamplePdf is zero,
  // since diffuse materials never sample a direction under the hemisphere.
  // However at this point, it doesn't even make sense to evaluate the 
  // rest of this function since we would be wasting a sample, thus we'll return
  // misWeight = 0 instead.
  if (
    dot(newDirection, surfaceNormals.shading) < 0.0 ||
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

  let brdf = evaluateDiffuseBrdf(materialData, surfaceAttributes);
  let simplifiedLocalSpaceDirection = vec3f(0.0, 0.0, dot(newDirection, surfaceNormals.shading));
  let brdfSamplePdf = evaluatePdfDiffuseLobe(simplifiedLocalSpaceDirection, surfaceNormals);
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
