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
  let lobeIndex: u32 = 1;

  var brdfSamplePdf: f32; var brdfMisWeight: f32; 
  var lightSamplePdf: f32; var lightMisWeight: f32; var lightSample: LightSample;
  var rayBrdf = Ray((*ray).origin, (*ray).direction);
  var rayLight = Ray((*ray).origin, (*ray).direction);

  shadeDiffuseSampleBRDF(rands1, N, &rayBrdf, &brdfSamplePdf, &brdfMisWeight, ires);

  // the reason why we're guarding NEE with this if statement is explained in the segment/integrators/mis-explanation.png
  if (debugInfo.bounce < config.BOUNCES_COUNT - 1) {
    
    if (!isRandomReplay) {
      shadeDiffuseSampleLight(rands2, N, &rayLight, &lightSamplePdf, &lightMisWeight, &lightSample);
      let lightSampleRadiance = lightSample.radiance;
      let lightSampleSuccessful = dot(lightSampleRadiance, lightSampleRadiance) > 0.0;

      // if we haven't found a reconnection vertex, and the previous vertex was not rough enough,
      // create and save a NEE path since this vertex is rough and all light source vertices are
      // treated as rough      
      if ((*psi).reconnectionVertexIndex == -1 && !psi.wasPrevVertexRough && lightSampleSuccessful) {
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
          setPathFlags(lobeIndex, 1, 0, 1), // set flags to "path ends by NEE" and "reconnects"
          u32(debugInfo.bounce + 1),        // reconnects at xk, which is the light vertex
          lightSample.triangleIndex, 
          lightSample.barycentrics, 
          lightSample.radiance, 
          vec3f(0),
          jacobian,
          vec2i(i32(lobeIndex), 2) // 2 is the emissive lobe-index
        );
        
        // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
        updateReservoir(reservoir, pathInfo, wi);
      }

      // if this vertex is a reconnection vertex, and we haven't found another one sooner,
      // use the light-sample path as a candidate. Also, prepare the jacobian for the possible
      // brdf-path candidates that might arrive at the next bounce
      if ((*psi).reconnectionVertexIndex == -1 && psi.wasPrevVertexRough) {
        var mi = lightMisWeight;
        let pHat = lightSampleRadiance * (1.0 / lightSamplePdf) * *throughput * 
                   brdf * max(dot(N, rayLight.direction), 0.0);
        let Wxi = 1.0;
        let wi = mi * length(pHat) * Wxi;

        let isConnectible = true; // we'll assume they're both rough and distant enough
        let w_vec = psi.prevVertexPosition - ires.hitPoint;
        let w_km1 = normalize(w_vec);
        let probability_of_sampling_lobe = 1.0;
        let p = (lightSamplePdf * probability_of_sampling_lobe) * 
                ((*psi).lobePdfPrevVertex * (*psi).brdfPdfPrevVertex);
        let jacobian = vec2f(p, abs(dot(w_km1, ires.triangle.geometricNormal)) / dot(w_vec, w_vec));

        // save the pointer values of path-info such that successive bounces can use them
        pi.F = pHat * mi;
        pi.seed = vec2i(tid.xy);
        pi.bounceCount = u32(debugInfo.bounce + 1);
        pi.reconnectionBounce = u32(debugInfo.bounce); // reconnects at xk, xk+1 is the light vertex
        pi.reconnectionTriangleIndex = ires.triangleIndex; 
        pi.reconnectionBarycentrics = ires.barycentrics; 
        // these last elements will be updated by Emissive for the brdf
        // path
        pi.flags = setPathFlags(lobeIndex, 1, 0, 1); // set flags to "path ends by NEE" and "reconnects"
        pi.reconnectionRadiance = lightSample.radiance; 
        pi.reconnectionDirection = rayLight.direction;
        pi.jacobian = jacobian;
        pi.reconnectionLobes = vec2i(psi.prevLobeIndex, i32(lobeIndex));
        
        // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
        updateReservoir(reservoir, *pi, wi);

        // prepare path info for the next brdf hit. The jacobian changes since we'll use brdf sampling
        // instead of light sampling to find xk+1
        pi.jacobian = vec2f(
          (brdfSamplePdf * 1.0) * 
          ((*psi).lobePdfPrevVertex * (*psi).brdfPdfPrevVertex), 
          abs(dot(w_km1, ires.triangle.geometricNormal)) / dot(w_vec, w_vec)
        );
        pi.reconnectionDirection = rayBrdf.direction;
        pi.flags = setPathFlags(lobeIndex, 0, 1, 0);
        
        psi.reconnectionVertexIndex = debugInfo.bounce;
      }

      // if we have already found a reconnection vertex previously
      if (
        (*psi).reconnectionVertexIndex != -1 && 
        (*psi).reconnectionVertexIndex != debugInfo.bounce && 
        lightSampleSuccessful
      ) {
        var mi = lightMisWeight;
        let lsThroughput = (brdf / lightSamplePdf) * max(dot(N, rayLight.direction), 0.0);
        let pHat = lightSampleRadiance * lsThroughput * *throughput;
                   
        let Wxi = 1.0;
        let wi = mi * length(pHat) * Wxi;
          
        pi.F = pHat * mi;
        pi.bounceCount = u32(debugInfo.bounce + 1);
        pi.reconnectionRadiance = psi.postfixThroughput * lsThroughput;

        // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
        updateReservoir(reservoir, *pi, wi);
      }
    }

    if (isRandomReplay) {
      // invertibility check
      if (psi.wasPrevVertexRough && pi.reconnectionBounce > u32(debugInfo.bounce)) {
        rrStepResult.valid = 0;
        rrStepResult.shouldTerminate = true;
        return rrStepResult;
      }

      // next vertex is the reconnection vertex, which is also a light source
      if (
        pathReconnectsAtLightVertex(*pi) && 
        pi.reconnectionBounce == u32(debugInfo.bounce+1)
      ) {
        let triangle = triangles[pi.reconnectionTriangleIndex];
        let nextVertexPosition = sampleTrianglePoint(triangle, pi.reconnectionBarycentrics).point;
        var isConnectible = true; // check distance condition

        // next vertex lobe will necessarily be identical since we're reconnecting to the same
        // xk, however for the previous vertex, xk-1, which is this vertex, we have to make this check
        if (i32(lobeIndex) != pi.reconnectionLobes.x) { isConnectible = false; }

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
          rrStepResult.valid = 0;
          rrStepResult.shouldTerminate = true;
          return rrStepResult;
        }

        // reconnection is successful
        let w_vec = nextVertexPosition - ires.hitPoint;
        let w_km1 = normalize(w_vec);
        let probability_of_sampling_lobe = 1.0;

        let brdfPdf = getBrdfPdf(w_km1, N);
        let lightPdf = getLightPDF(Ray(ires.hitPoint + w_km1 * 0.0001, w_km1));

        var p = 1.0;
        var mi = 0.0; 
        if (pathIsBrdfSampled(*pi)) {
          p *= brdfPdf * probability_of_sampling_lobe;
          mi = getMisWeight(brdfPdf, lightPdf);
        }
        if (pathIsLightSampled(*pi)) {
          p *= lightPdf * probability_of_sampling_lobe;
          mi = getMisWeight(lightPdf, brdfPdf);
        }

        var jacobian = vec2f(
          p, 
          abs(dot(w_km1, triangle.geometricNormal)) / dot(w_vec, w_vec)
        );
        let pHat = pi.reconnectionRadiance * (1.0 / p) * *throughput * 
                   brdf * max(dot(N, w_km1), 0.0);

        rrStepResult.valid = 1;
        rrStepResult.shouldTerminate = true;
        rrStepResult.jacobian = jacobian;
        rrStepResult.pHat = pHat * mi;
        return rrStepResult;
      }

      // next vertex is the reconnection vertex and the path ends on the vertex after that
      if (
        pathReconnectsOneVertextBeforeLight(*pi) &&
        pi.reconnectionBounce == u32(debugInfo.bounce+1)
      ) {
        let triangle = triangles[pi.reconnectionTriangleIndex];
        let nextVertexPosition = sampleTrianglePoint(triangle, pi.reconnectionBarycentrics).point;
        var isConnectible = true; // check distance condition

        // next vertex lobe will necessarily be identical since we're reconnecting to the same
        // xk, however for the previous vertex, xk-1, which is this vertex, we have to make this check
        if (i32(lobeIndex) != pi.reconnectionLobes.x) { isConnectible = false; }

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
          rrStepResult.valid = 0;
          rrStepResult.shouldTerminate = true;
          return rrStepResult;
        }

        // reconnection is successful
        let w_vec = nextVertexPosition - ires.hitPoint;
        let w_km1 = normalize(w_vec);
        let probability_of_sampling_lobe = 1.0;

        let brdfPdf = getBrdfPdf(w_km1, N);
        // probability for vertex x_k_minus_1
        var p = probability_of_sampling_lobe * brdfPdf;
        
        // now calculate probabilities for vertex xk
        var mi = 0.0;
        var brdfXk = vec3f(0.0);
        var vertexNormal = visibilityRes.normal;
        if (dot(visibilityRes.triangle.geometricNormal, w_km1) > 0) {
          vertexNormal = -vertexNormal;
        }
        var N2 = vertexNormal;

        if (pi.reconnectionLobes.y == 1) {
          let material: Diffuse = createDiffuse(triangle.materialOffset);
          var color = material.color;
          
          brdfXk = color / PI;
          let brdfPdf = getBrdfPdf(pi.reconnectionDirection, N2);
          let lightPdf = getLightPDF(Ray(visibilityRes.hitPoint + pi.reconnectionDirection * 0.0001, pi.reconnectionDirection));
          if (pathIsBrdfSampled(*pi)) {
            p *= brdfPdf * probability_of_sampling_lobe;
            mi = getMisWeight(brdfPdf, lightPdf);
          }
          if (pathIsLightSampled(*pi)) {
            p *= lightPdf * probability_of_sampling_lobe;
            mi = getMisWeight(lightPdf, brdfPdf);
          }
        }

        if (pi.reconnectionLobes.y == 2) {
          brdfXk = vec3f(1 / PI);
          mi = 1;
          p *= probability_of_sampling_lobe * (1 / (2 * PI));      
        }

        var jacobian = vec2f(
          p, 
          abs(dot(w_km1, triangle.geometricNormal)) / dot(w_vec, w_vec)
        );

        let pHat = pi.reconnectionRadiance * (1.0 / p) * *throughput * 
                   brdf * brdfXk * max(dot(N, w_km1), 0.0) * 
                   max(dot(N2, pi.reconnectionDirection), 0.0);

        rrStepResult.valid = 1;
        rrStepResult.shouldTerminate = true;
        rrStepResult.jacobian = jacobian;
        rrStepResult.pHat = pHat * mi;
        return rrStepResult;
      }

      // next vertex is the reconnection vertex and the path ends far from light source
      if (
        pathReconnectsFarFromLightVertex(*pi) &&
        pi.reconnectionBounce == u32(debugInfo.bounce+1)
      ) {
        let triangle = triangles[pi.reconnectionTriangleIndex];
        let nextVertexPosition = sampleTrianglePoint(triangle, pi.reconnectionBarycentrics).point;
        var isConnectible = true; // check distance condition
      
        // next vertex lobe will necessarily be identical since we're reconnecting to the same
        // xk, however for the previous vertex, xk-1, which is this vertex, we have to make this check
        if (i32(lobeIndex) != pi.reconnectionLobes.x) { isConnectible = false; }
      
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
          rrStepResult.valid = 0;
          rrStepResult.shouldTerminate = true;
          return rrStepResult;
        }
      
        // reconnection is successful
        let w_vec = nextVertexPosition - ires.hitPoint;
        let w_km1 = normalize(w_vec);
        let probability_of_sampling_lobe = 1.0;
      
        let brdfPdf = getBrdfPdf(w_km1, N);
        // probability for vertex x_k_minus_1
        var p = probability_of_sampling_lobe * brdfPdf;

        // now calculate probabilities for vertex xk
        var mi = 1.0;
        var brdfXk = vec3f(0.0);
        var vertexNormal = visibilityRes.normal;
        if (dot(visibilityRes.triangle.geometricNormal, w_km1) > 0) {
          vertexNormal = -vertexNormal;
        }
        var N2 = vertexNormal;

        if (pi.reconnectionLobes.y == 1) {
          let material: Diffuse = createDiffuse(triangle.materialOffset);
          var color = material.color;

          brdfXk = color / PI;
          let brdfPdf = getBrdfPdf(pi.reconnectionDirection, N2);
          p *= brdfPdf * probability_of_sampling_lobe;
          mi = 1;
        }
      
        if (pi.reconnectionLobes.y == 2) {
          brdfXk = vec3f(1 / PI);
          mi = 1;
          p *= probability_of_sampling_lobe * (1 / (2 * PI));      
        }
      
        var jacobian = vec2f(
          p, 
          abs(dot(w_km1, triangle.geometricNormal)) / dot(w_vec, w_vec)
        );
      
        let pHat = pi.reconnectionRadiance * (1.0 / p) * *throughput * 
                   brdf * brdfXk * max(dot(N, w_km1), 0.0) * 
                   max(dot(N2, pi.reconnectionDirection), 0.0);

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
  let t = brdf * (/* mis weight */ 1.0 / brdfSamplePdf) * max(dot(N, rayBrdf.direction), 0.0);
  *throughput *= t; 
  // already found reconnection vertex previously
  if (
    (*psi).reconnectionVertexIndex != -1 && 
    (*psi).reconnectionVertexIndex < debugInfo.bounce
  ) {
    // brdf-ray post fix throughput
    psi.postfixThroughput *= t;
  }
  
  psi.wasPrevVertexRough = true;
  psi.prevVertexPosition = ires.hitPoint;
  psi.prevVertexBrdf     = brdf;
  psi.brdfPdfPrevVertex  = brdfSamplePdf;
  psi.lobePdfPrevVertex  = 1.0;
  psi.prevLobeIndex = i32(lobeIndex);

  return rrStepResult;
}
`;
