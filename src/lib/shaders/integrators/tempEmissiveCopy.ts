export const tempEmissiveCopy = /* wgsl */ `
fn shadeEmissive(
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
  /*
    **************************
    ***** important note *****
    **************************

    If you ever decide to apply MIS / NEE on emissive surfaces,
    remember to invalidate light source samples that selected the same light source 
    that is being shaded
  */

  let hitPoint = ires.hitPoint;
  let material: Emissive = createEmissive(ires.triangle.materialOffset);

  var emissive = material.color * material.intensity;
  const albedo = vec3f(1,1,1);
  const brdfPdf = 1 / (2 * PI);
  const brdf = (1 / PI);
  const lobeIndex: u32 = 2;

  (*ray).origin = ires.hitPoint - (*ray).direction * 0.001;

  var isBackFacing = false;

  var N = ires.triangle.geometricNormal;
  if (dot(N, (*ray).direction) > 0) {
    N = -N;
    isBackFacing = true;
  }

  if (isBackFacing) {
    emissive = vec3f(0.0);
  }

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
  getTangentFromTriangle(ires, ires.triangle, N, &tangent, &bitangent);

  // https://learnopengl.com/Advanced-Lighting/Normal-Mapping
  let TBN = mat3x3f(tangent, bitangent, N);
  // from tangent space to world space
  let newDirection = normalize(TBN * nd.xzy);

  var rrStepResult = RandomReplayResult(0, vec3f(0.0), false, vec2f(0.0));

  if (!isRandomReplay) {
    // directly hitting light source at bounce 0
    if (debugInfo.bounce == 0) {
      let mi = *lastBrdfMis; // will be 1 in this case
      let pHat = emissive * *throughput; // throughput will be 1 in this case
      let wi = mi * length(pHat);

      let pathInfo = PathInfo(
        pHat * mi,
        vec2i(tid.xy),
        u32(debugInfo.bounce),
        setPathFlags(lobeIndex, 0, 1, 0), // set flags to "path ends by NEE" and "reconnects"
        u32(debugInfo.bounce),        // reconnects at xk, which is the light vertex
        -1, 
        vec2f(0.0), 
        vec3f(0.0), 
        vec3f(0),
        vec2f(1.0),
        vec2i(-1, -1) // 2 is the emissive lobe-index
      );
      
      // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
      updateReservoir(reservoir, pathInfo, wi);
    }

    // if we haven't found a reconnection vertex, and the previous vertex was not rough enough,
    // create and save a pure random replay path     
    if ((*psi).reconnectionVertexIndex == -1 && !psi.wasPrevVertexRough) {
      // ************************************
      // ************************************
      // TODO: NOT IMPLEMENTED
      // ************************************
      // ************************************
    }

    // if this vertex is a reconnection vertex, and we haven't found another one sooner,
    // use this path as a candidate, and save reconnection information
    // for potential future candidates
    if ((*psi).reconnectionVertexIndex == -1 && psi.wasPrevVertexRough) {
      let mi = *lastBrdfMis;
      let pHat = emissive * *throughput;
      let Wxi = 1.0;
      let wi = mi * length(pHat) * Wxi;

      let isConnectible = psi.wasPrevVertexRough; // we'll assume they're both rough and distant enough
      // ******************* TODO ******************
      // ******************* TODO ******************
      // I think this direction is wrong? but the fact that we're doing
      // the abs in the jacobian hides it?
      // ******************* TODO ******************
      // ******************* TODO ******************
      let w_vec = ires.hitPoint - psi.prevVertexPosition;
      let w_km1 = normalize(w_vec);
      let p = psi.brdfPdfPrevVertex * psi.lobePdfPrevVertex;
      var jacobian = vec2f(
        p, 
        abs(dot(w_km1, ires.triangle.geometricNormal)) / dot(w_vec, w_vec)
      );

      // save the pointer values of path-info such that successive bounces can use them
      pi.F = pHat * mi;
      pi.seed = vec2i(tid.xy);
      pi.bounceCount = u32(debugInfo.bounce);
      pi.reconnectionBounce = u32(debugInfo.bounce); // reconnects at xk, xk+1 is the light vertex
      pi.reconnectionTriangleIndex = ires.triangleIndex; 
      pi.reconnectionBarycentrics = ires.barycentrics;
      // these last elements will be updated by Emissive for the brdf
      // path
      pi.flags = setPathFlags(lobeIndex, 0, 1, 1); // set flags to "path ends by NEE" and "reconnects"
      pi.reconnectionRadiance = emissive; 
      pi.reconnectionDirection = vec3f(0.0);
      pi.jacobian = jacobian;
      pi.reconnectionLobes = vec2i(psi.prevLobeIndex, i32(lobeIndex));

      // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
      updateReservoir(reservoir, *pi, wi);

      // prepare path info for the next brdf hit. The jacobian changes since we'll add brdf sampling
      // for the light ray that finds xk+1
      pi.jacobian = vec2f(
        (brdfPdf * 1.0) * 
        ((*psi).lobePdfPrevVertex * (*psi).brdfPdfPrevVertex), 
        abs(dot(w_km1, ires.triangle.geometricNormal)) / dot(w_vec, w_vec)
      );
      pi.reconnectionDirection = newDirection;
      pi.flags = setPathFlags(lobeIndex, 0, 1, 1);
      
      psi.reconnectionVertexIndex = debugInfo.bounce;
    }

    // if the previous vertex is the reconnection vertex
    if (
      (*psi).reconnectionVertexIndex != -1 &&
      (*psi).reconnectionVertexIndex == (debugInfo.bounce-1)
    ) {
      var mi = *lastBrdfMis;
      let pHat = emissive * *throughput;

      let isConnectible = psi.wasPrevVertexRough; // we'll assume they're both rough and distant enough
      let w_vec = psi.prevVertexPosition - ires.hitPoint;
      let w_km1 = normalize(w_vec);

      // the jacobian has already been calculated in the previous vertex, we don't need to add to it here.
      // the previous bounce handled the rest
      pi.flags = setPathFlags(lobeIndex, 0, 1, 1);
      pi.F = pHat * mi;
      pi.seed = vec2i(tid.xy);
      pi.bounceCount = u32(debugInfo.bounce);
      pi.reconnectionRadiance = emissive;
      
      let Wxi = 1.0;
      let wi = mi * length(pHat) * Wxi;
        
      // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
      updateReservoir(reservoir, *pi, wi);
    }

    // if we have already found a reconnection vertex, at least 2 bounces away from this light source
    if (
      (*psi).reconnectionVertexIndex != -1 && 
      (*psi).reconnectionVertexIndex < (debugInfo.bounce - 1) 
    ) {
      var mi = *lastBrdfMis;
      let pHat = emissive * *throughput;
      let Wxi = 1.0;
      let wi = mi * length(pHat) * Wxi;
        
      pi.F = pHat * mi;
      pi.bounceCount = u32(debugInfo.bounce);
      // for this type of path ending, we have to multiply the reconnectionRadiance by mi
      pi.reconnectionRadiance = psi.postfixThroughput * emissive * mi;

      // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
      updateReservoir(reservoir, *pi, wi);
    }
  }

  if (isRandomReplay) {
    // directly hitting light source at bounce 0
    if (pi.bounceCount == 0 && debugInfo.bounce == 0 && !isBackFacing) {
      let mi = *lastBrdfMis; // will be 1 in this case
      let pHat = emissive * *throughput; // throughput will be 1 in this case
      let wi = mi * length(pHat);

      rrStepResult.valid = 1;
      rrStepResult.shouldTerminate = true;
      rrStepResult.jacobian = vec2f(1.0);
      rrStepResult.pHat = pHat * mi;
      return rrStepResult;
    }

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
      // in this case, we have to check wether the light source is backfacing, since it's the next vertex
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

      var p = 1.0;
      var mi = 1.0; 
      p *= brdfPdf * probability_of_sampling_lobe;

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
      // in this case, we DON'T have to check wether the next vertex is backfacing, since it's NOT the light source
      // let backFacing = dot(-dir, visibilityRes.triangle.geometricNormal) < 0;
      if (!visibilityRes.hit || pi.reconnectionTriangleIndex != visibilityRes.triangleIndex) {
        // shift failed, should terminate
        rrStepResult.valid = 0;
        rrStepResult.shouldTerminate = true;
        return rrStepResult;
      }

      // reconnection is successful
      let w_vec = nextVertexPosition - ires.hitPoint;
      let w_km1 = normalize(w_vec);
      let probability_of_sampling_lobe = 1.0;

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
      // in this case, we DON'T have to check wether the next vertex is backfacing, since it's NOT the light source
      // let backFacing = dot(-dir, visibilityRes.triangle.geometricNormal) < 0;
      if (!visibilityRes.hit || pi.reconnectionTriangleIndex != visibilityRes.triangleIndex) {
        // shift failed, should terminate
        rrStepResult.valid = 0;
        rrStepResult.shouldTerminate = true;
        return rrStepResult;
      }
    
      // reconnection is successful
      let w_vec = nextVertexPosition - ires.hitPoint;
      let w_km1 = normalize(w_vec);
      let probability_of_sampling_lobe = 1.0;
    
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

    }
  }

  (*ray).direction = newDirection;

  *lastBrdfMis = 1.0;
  let t = albedo * max(dot(N, (*ray).direction), 0.0) * brdf * (1 / brdfPdf);
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
  psi.prevVertexBrdf     = vec3f(brdf);
  psi.prevVertexPosition = ires.hitPoint;
  psi.brdfPdfPrevVertex = brdfPdf;
  psi.lobePdfPrevVertex = 1.0;
  psi.prevLobeIndex = i32(lobeIndex);

  return rrStepResult;
} 
`;
