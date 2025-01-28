export const tempDiffCopy = /* wgsl */ `fn shadeDiffuseSampleBRDF(
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

fn shadeDiffuse(
  ires: BVHIntersectionResult, 
  ray: ptr<function, Ray>,
  reservoir: ptr<function, Reservoir>,
  throughput: ptr<function, vec3f>, 
  pi: PathInfo,
  lastBrdfMis: ptr<function, f32>, 
  isRandomReplay: bool,
  tid: vec3u,
  i: i32
) -> RandomReplayResult {
  let hitPoint = ires.hitPoint;
  let material: Diffuse = createDiffuse(ires.triangle.materialOffset);

  var color = material.color;
  if (material.mapLocation.x > -1) {
    color *= getTexelFromTextureArrays(material.mapLocation, ires.uv, material.mapUvRepeat).xyz;
  }

  var vertexNormal = ires.normal;
  // the normal flip is calculated using the geometric normal to avoid
  // black edges on meshes displaying strong smooth-shading via vertex normals
  if (dot(ires.triangle.geometricNormal, (*ray).direction) > 0) {
    vertexNormal = -vertexNormal;
  }
  var N = vertexNormal;
  var bumpOffset: f32 = 0.0;
  if (material.bumpMapLocation.x > -1) {
    N = getShadingNormal(
      material.bumpMapLocation, material.bumpStrength, material.uvRepeat, N, *ray, 
      ires, &bumpOffset
    );
  }

  let x0 = ray.origin;
  let x1 = ires.hitPoint;
  
  if (debugInfo.bounce == 0) {
    (*reservoir).Gbuffer = vec4f(vertexNormal, length((*ray).origin - ires.hitPoint));
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
  var colorLessBrdf = 1.0 / PI;

  var rrStepResult = RandomReplayResult(0, vec3f(0.0));

  var brdfSamplePdf: f32; var brdfMisWeight: f32; 
  var lightSamplePdf: f32; var lightMisWeight: f32; var lightSampleRadiance: vec3f;
  var rayBrdf = Ray((*ray).origin, (*ray).direction);
  var rayLight = Ray((*ray).origin, (*ray).direction);

  shadeDiffuseSampleBRDF(rands1, N, &rayBrdf, &brdfSamplePdf, &brdfMisWeight, ires);
  
  // the reason why we're guarding NEE with this if statement is explained in the segment/integrators/mis-explanation.png
  if (debugInfo.bounce < config.BOUNCES_COUNT - 1) {
    shadeDiffuseSampleLight(rands2, N, &rayLight, &lightSamplePdf, &lightMisWeight, &lightSampleRadiance);
  
    if (length(lightSampleRadiance) > 0.0) {
      var mi = lightMisWeight;
      let pHat = lightSampleRadiance * (1.0 / lightSamplePdf) * *throughput * 
                 brdf * max(dot(N, rayLight.direction), 0.0);
      let Wxi = 1.0;
  
      let wi = mi * length(pHat) * Wxi;
  
      if (isRandomReplay) {
        if (pi.bounceCount == u32(debugInfo.bounce) && pi.flags == 1) {
          rrStepResult.valid = 1;
          // why do we have to multiply by "mi" here and in the pathinfo struct below to fix 
          // some issues related to correct convergence to the right result?
          // I could be wrong, but I think the rationale is this:
          // when we do spatial-reuse, inside the generalized balance heuristic we are
          // effectively posing this question (in the denominator loop): 
          // what was the likelyhood of this path being
          // generated by pixel xyz? that probability, requires modulation by "mi".
          // because effectively the probability of selecting a specific path is:
          // wi = mi * pHat * Wxi
          // thus the reservoir will choose that path with a probability that also depends on "mi"
          rrStepResult.pHat = pHat * mi;
        }
      } else {
        let pathInfo = PathInfo(
          pHat * mi,
          vec2i(tid.xy),
          u32(debugInfo.bounce),
          1   // always set flags to "path ends by NEE"
        );
    
        // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
        updateReservoir(reservoir, pathInfo, wi);
      }
    }
  }

  (*ray).origin += rayBrdf.direction * 0.001;
  (*ray).direction = rayBrdf.direction;

  *lastBrdfMis = brdfMisWeight;
  *throughput *= brdf * (/* mis weight */ 1.0 / brdfSamplePdf) * max(dot(N, rayBrdf.direction), 0.0); 

  return rrStepResult;
}
`;
