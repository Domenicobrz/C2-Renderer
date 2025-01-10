import { MATERIAL_TYPE } from '$lib/materials/material';

export const tempShadCopy = /*wgsl*/ `

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
  getTangentFromTriangle(ires, ires.triangle, N, &tangent, &bitangent);

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
`;
