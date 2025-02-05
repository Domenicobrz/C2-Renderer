export const tempDiffCopy = /* wgsl */ `
fn getBrdfPdf(direction: vec3f, N: vec3f) -> f32 {
  let cosTheta = dot(direction, N);
  var brdfSamplePdf = cosTheta / PI;

  return brdfSamplePdf;
}

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
  lightSample: ptr<function, LightSample>,
) {
  *lightSample = getLightSample(ray.origin, rands);
  *pdf = (*lightSample).pdf;
  let backSideHit = (*lightSample).backSideHit;

  (*ray).direction = (*lightSample).direction;

  let cosTheta = dot((*lightSample).direction, N);
  var brdfSamplePdf = cosTheta / PI;
  // if the sampled ray sits below the hemisphere, brdfSamplePdf is zero,
  // since diffuse materials never sample a direction under the hemisphere.
  // However at this point, it doesn't even make sense to evaluate the 
  // rest of this function since we would be wasting a sample, thus we'll return
  // misWeight = 0 instead.
  if (
    dot((*ray).direction, N) < 0.0 ||
    (*lightSample).pdf == 0.0
  ) {
    brdfSamplePdf = 0;
    *misWeight = 0; *pdf = 1; 
    (*lightSample).radiance = vec3f(0.0);
    return;
  }

  *misWeight = getMisWeight((*lightSample).pdf, brdfSamplePdf);
}

fn shadeDiffuse(
  ires: BVHIntersectionResult, 
  ray: ptr<function, Ray>,
  reservoir: ptr<function, Reservoir>,
  throughput: ptr<function, vec3f>, 
  pi: ptr<function, PathInfo>,
  psi: ptr<function, PathSampleInfo>,
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

  var rrStepResult = RandomReplayResult(0, vec3f(0.0), false, vec2f(0.0));

  var brdfSamplePdf: f32; var brdfMisWeight: f32; 
  var lightSamplePdf: f32; var lightMisWeight: f32; var lightSample: LightSample;
  var rayBrdf = Ray((*ray).origin, (*ray).direction);
  var rayLight = Ray((*ray).origin, (*ray).direction);

  shadeDiffuseSampleBRDF(rands1, N, &rayBrdf, &brdfSamplePdf, &brdfMisWeight, ires);
  
  // the reason why we're guarding NEE with this if statement is explained in the segment/integrators/mis-explanation.png
  if (debugInfo.bounce < config.BOUNCES_COUNT - 1) {
    let lobeIndex: u32 = 1;
    
    if (!isRandomReplay) {
      shadeDiffuseSampleLight(rands2, N, &rayLight, &lightSamplePdf, &lightMisWeight, &lightSample);
      let lightSampleRadiance = lightSample.radiance;

      if (length(lightSampleRadiance) > 0.0) {
        var mi = lightMisWeight;
        let pHat = lightSampleRadiance * (1.0 / lightSamplePdf) * *throughput * 
                   brdf * max(dot(N, rayLight.direction), 0.0);
        let Wxi = 1.0;
        let wi = mi * length(pHat) * Wxi;

        let isConnectible = true; // we'll assume they're both rough and distant enough
        let w_vec = lightSample.hitPoint - ires.hitPoint;
        let w_km1 = normalize(w_vec);
        let probability_of_sampling_lobe = 1.0;
        let p = lightSamplePdf * probability_of_sampling_lobe;
        let jacobian = vec2f(p, abs(dot(w_km1, lightSample.geometricNormal)) / dot(w_vec, w_vec));

        let pathInfo = PathInfo(
          pHat * mi,
          vec2i(tid.xy),
          u32(debugInfo.bounce + 1),
          setPathFlags(lobeIndex, 1, 0, 1), // set flags to "path ends by NEE"
          u32(debugInfo.bounce + 1), 
          lightSample.triangleIndex, 
          lightSample.barycentrics, 
          lightSample.radiance, 
          vec3f(0),
          jacobian
        );
        
        // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
        updateReservoir(reservoir, pathInfo, wi);
      }
    }

    if (isRandomReplay) {
      // next vertex is reconnection vertex
      if (pathReconnects(*pi) && pi.reconnectionBounce == u32(debugInfo.bounce+1)) {        
        let triangle = triangles[pi.reconnectionTriangleIndex];
        let nextVertexPosition = sampleTrianglePoint(triangle, pi.reconnectionBarycentrics).point;
      
        let isConnectible = true; // check distance condition
        if (!isConnectible) {
          // shift failed, should terminate
          // shift failed, should terminate
          // shift failed, should terminate
          // shift failed, should terminate
          rrStepResult.valid = 0;
          rrStepResult.shouldTerminate = true;
          return rrStepResult;
        }

        let dir = normalize(nextVertexPosition - ires.hitPoint);
        let visibilityRay = Ray(ires.hitPoint + dir * 0.0001, dir);

        // TODO: we're doing a bvh traversal here that is probably unnecessary
        // TODO: we're doing a bvh traversal here that is probably unnecessary
        // TODO: we're doing a bvh traversal here that is probably unnecessary,
        //       can we use only the call to getLightPdf to make our checks?
        let visibilityRes = bvhIntersect(visibilityRay);
        let backFacing = dot(-dir, visibilityRes.triangle.geometricNormal) < 0;
        if (!visibilityRes.hit || pi.reconnectionTriangleIndex != visibilityRes.triangleIndex || backFacing) {
          // shift failed, should terminate
          // shift failed, should terminate
          // shift failed, should terminate
          // shift failed, should terminate
          // shift failed, should terminate
          // shift failed, should terminate
          rrStepResult.valid = 0;
          rrStepResult.shouldTerminate = true;
          return rrStepResult;
        }

        // reconnection is successful
        let w_vec = nextVertexPosition - ires.hitPoint;
        let w_km1 = normalize(w_vec);
        let probability_of_sampling_lobe = 1.0;

        var p = 0.0;
        var mi = 0.0;
        let brdfPdf = getBrdfPdf(w_km1, N);
        let lightPdf = getLightPDF(Ray(ires.hitPoint + w_km1 * 0.0001, w_km1));
        if (pathIsBrdfSampled(*pi)) {
          p = brdfPdf;
          mi = getMisWeight(brdfPdf, lightPdf);
        }
        if (pathIsLightSampled(*pi)) {
          p = lightPdf;
          mi = getMisWeight(lightPdf, brdfPdf);
        }

        var jacobian = vec2f(
          p * probability_of_sampling_lobe, 
          abs(dot(w_km1, triangle.geometricNormal)) / dot(w_vec, w_vec)
        );
      
        let pHat = pi.reconnectionRadiance * (1.0 / p) * *throughput * 
                   brdf * max(dot(N, dir), 0.0);

        rrStepResult.valid = 1;
        rrStepResult.shouldTerminate = true;
        rrStepResult.jacobian = jacobian;
        rrStepResult.pHat = pHat * mi;

        return rrStepResult;
      }

      if (
        pathDoesNotReconnect(*pi) && 
        pi.bounceCount == u32(debugInfo.bounce + 1) && 
        pathIsLightSampled(*pi) && 
        pathHasLobeIndex(*pi, lobeIndex)
      ) {
        rrStepResult.valid = 0;
        rrStepResult.shouldTerminate = true;
        return rrStepResult;

        // ************************************
        // ************************************
        // TODO: NOT IMPLEMENTED - THIS EDGECASE CAN HAPPEN IF
        // WE FAIL TO RECONNECT DUE TO THE DISTANCE CONDITION
        // ************************************
        // ************************************

        // shadeDiffuseSampleLight(rands2, N, &rayLight, &lightSamplePdf, &lightMisWeight, &lightSample);
        // let lightSampleRadiance = lightSample.radiance;

        // if (length(lightSampleRadiance) > 0.0) {
        //   var mi = lightMisWeight;
        //   let pHat = lightSampleRadiance * (1.0 / lightSamplePdf) * *throughput * 
        //              brdf * max(dot(N, rayLight.direction), 0.0);
        //   let Wxi = 1.0;
  
        //   let wi = mi * length(pHat) * Wxi;
        //   rrStepResult.valid = 1;
        //   rrStepResult.pHat = pHat * mi;
        // }
      }
    }
  }

  (*ray).origin += rayBrdf.direction * 0.001;
  (*ray).direction = rayBrdf.direction;

  *lastBrdfMis = brdfMisWeight;
  *throughput *= brdf * (/* mis weight */ 1.0 / brdfSamplePdf) * max(dot(N, rayBrdf.direction), 0.0); 
  
  psi.wasPrevVertexRough = true;
  psi.prevVertexPosition = ires.hitPoint;
  psi.brdfPdfPrevVertex = brdfSamplePdf;
  psi.lobePdfPrevVertex = 1.0;

  return rrStepResult;
}
`;
