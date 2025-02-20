export let pathConstruction = /* wgsl */ `
fn neePathConstruction(
  lightDirectionSample: LightDirectionSample,
  brdfDirectionSample: BrdfDirectionSample,
  ires: BVHIntersectionResult, 
  ray: ptr<function, Ray>,
  reservoir: ptr<function, Reservoir>,
  throughput: ptr<function, vec3f>, 
  pi: ptr<function, PathInfo>,
  psi: ptr<function, PathSampleInfo>,
  lastBrdfMis: ptr<function, f32>, 
  lobeIndex: u32,
  N: vec3f,
  tid: vec3u,
) {
  let lightPointSample = lightDirectionSample.ls;
  let lightSampleRadiance = lightPointSample.radiance;

  // if we haven't found a reconnection vertex, and the previous vertex was not rough enough,
  // create and save a NEE path since this vertex is rough and all light source vertices are
  // treated as rough      
  if ((*psi).reconnectionVertexIndex == -1 && !psi.wasPrevVertexRough) {
    var mi = lightDirectionSample.mis;
    let pHat = lightSampleRadiance * (1.0 / lightDirectionSample.pdf) * *throughput * 
               lightDirectionSample.brdf * max(dot(N, lightDirectionSample.dir), 0.0);
    let Wxi = 1.0;
    let wi = mi * length(pHat) * Wxi;

    let isConnectible = true; // we'll assume they're both rough and distant enough

    let w_vec = lightPointSample.hitPoint - ires.hitPoint;
    let w_km1 = normalize(w_vec);
    let probability_of_sampling_lobe = 1.0;
    let p = lightDirectionSample.pdf * probability_of_sampling_lobe;
    let jacobian = vec2f(p, abs(dot(w_km1, lightPointSample.geometricNormal)) / dot(w_vec, w_vec));

    let pathInfo = PathInfo(
      pHat * mi,
      vec2i(tid.xy),
      u32(debugInfo.bounce + 1),
      setPathFlags(lobeIndex, 1, 0, 1), // set flags to "path ends by NEE" and "reconnects"
      u32(debugInfo.bounce + 1),        // reconnects at xk, which is the light vertex
      lightPointSample.triangleIndex, 
      lightPointSample.barycentrics, 
      lightPointSample.radiance, 
      vec3f(0),
      jacobian,
      vec2i(i32(lobeIndex), 2) // 2 is the emissive lobe-index
    );
  
    // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
    updateReservoir(reservoir, pathInfo, wi);
  }

  // if this vertex is a reconnection vertex, use the light-sample path as a candidate. 
  // Also, prepare the jacobian for the possible brdf-path candidates that might arrive 
  // at the next bounce
  if (psi.reconnectionVertexIndex == debugInfo.bounce) {
    var mi = lightDirectionSample.mis;
    let pHat = lightSampleRadiance * (1.0 / lightDirectionSample.pdf) * *throughput * 
               lightDirectionSample.brdf * max(dot(N, lightDirectionSample.dir), 0.0);
    let Wxi = 1.0;
    let wi = mi * length(pHat) * Wxi;

    let isConnectible = true; // we'll assume they're both rough and distant enough
    let w_vec = psi.prevVertexPosition - ires.hitPoint;
    let w_km1 = normalize(w_vec);
    let probability_of_sampling_lobe = 1.0;
    let p = (lightDirectionSample.pdf * probability_of_sampling_lobe) * 
            ((*psi).lobePdfPrevVertex * (*psi).brdfPdfPrevVertex);
    let jacobian = vec2f(p, abs(dot(w_km1, ires.triangle.geometricNormal)) / dot(w_vec, w_vec));

    // save the pointer values of path-info such that successive bounces can use them
    pi.F = pHat * mi;
    pi.seed = vec2i(tid.xy);
    pi.bounceCount = u32(debugInfo.bounce + 1);
    // v v v v v v v saved in another function v v v v v v v 
    // pi.reconnectionBounce = u32(debugInfo.bounce); // reconnects at xk, xk+1 is the light vertex
    // pi.reconnectionTriangleIndex = ires.triangleIndex; 
    // pi.reconnectionBarycentrics = ires.barycentrics; 
    // these last elements will be updated by Emissive for the brdf
    // path
    pi.flags = setPathFlags(lobeIndex, 1, 0, 1); // set flags to "path ends by NEE" and "reconnects"
    pi.reconnectionRadiance = lightPointSample.radiance; 
    pi.reconnectionDirection = lightDirectionSample.dir;
    pi.jacobian = jacobian;
    pi.reconnectionLobes = vec2i(psi.prevLobeIndex, i32(lobeIndex));
    
    // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
    updateReservoir(reservoir, *pi, wi);

    // v v v v v v v moved to a separate function v v v v v v v v 
    // // prepare path info for the next brdf hit. The jacobian changes since we'll use brdf sampling
    // // instead of light sampling to find xk+1
    // // wait, what are we preparing for here? the jacobian is "complete"
    // pi.jacobian = vec2f(
    //   (brdfDirectionSample.pdf * 1.0) * 
    //   ((*psi).lobePdfPrevVertex * (*psi).brdfPdfPrevVertex), 
    //   abs(dot(w_km1, ires.triangle.geometricNormal)) / dot(w_vec, w_vec)
    // );
    // pi.reconnectionRadiance = vec3f(0);
    // pi.reconnectionDirection = brdfDirectionSample.dir;
    // pi.flags = setPathFlags(lobeIndex, 0, 1, 1);
    
    // psi.reconnectionVertexIndex = debugInfo.bounce;
  }

  // if we have already found a reconnection vertex previously
  if (
    (*psi).reconnectionVertexIndex != -1 && 
    (*psi).reconnectionVertexIndex < debugInfo.bounce
  ) {
    var mi = lightDirectionSample.mis;
    let lsThroughput = (lightDirectionSample.brdf / lightDirectionSample.pdf) *
      max(dot(N, lightDirectionSample.dir), 0.0);
    let pHat = lightSampleRadiance * lsThroughput * *throughput;
               
    let Wxi = 1.0;
    let wi = mi * length(pHat) * Wxi;
      
    pi.F = pHat * mi;
    pi.bounceCount = u32(debugInfo.bounce + 1);
    // for this type of path ending, we have to multiply the reconnectionRadiance by mi
    pi.reconnectionRadiance = lightSampleRadiance * psi.postfixThroughput * lsThroughput * mi;

    // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
    updateReservoir(reservoir, *pi, wi);
  }
}

fn emissiveSurfacePathConstruction(
  brdfDirectionSample: BrdfDirectionSample,
  ires: BVHIntersectionResult, 
  ray: ptr<function, Ray>,
  reservoir: ptr<function, Reservoir>,
  throughput: ptr<function, vec3f>, 
  pi: ptr<function, PathInfo>,
  psi: ptr<function, PathSampleInfo>,
  lastBrdfMis: ptr<function, f32>, 
  lobeIndex: u32,
  N: vec3f,
  emissive: vec3f,
  tid: vec3u,
) {
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
      vec2i(-1, -1)
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
  if (psi.reconnectionVertexIndex == debugInfo.bounce) {
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
    // v v v v v v v saved in another function v v v v v v v 
    // pi.reconnectionBounce = u32(debugInfo.bounce); // reconnects at xk, xk+1 is the light vertex
    // pi.reconnectionTriangleIndex = ires.triangleIndex; 
    // pi.reconnectionBarycentrics = ires.barycentrics;
    // these last elements will be updated by Emissive for the brdf
    // path
    pi.flags = setPathFlags(lobeIndex, 0, 1, 1); // set flags to "path ends by NEE" and "reconnects"
    pi.reconnectionRadiance = emissive; 
    pi.reconnectionDirection = vec3f(0.0);
    pi.jacobian = jacobian;
    pi.reconnectionLobes = vec2i(psi.prevLobeIndex, i32(lobeIndex));

    // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
    updateReservoir(reservoir, *pi, wi);

    // v v v v v v v moved to a separate function v v v v v v v v 
    // // prepare path info for the next brdf hit. The jacobian changes since we'll add brdf sampling
    // // for the light ray that finds xk+1
    // pi.jacobian = vec2f(
    //   (brdfDirectionSample.pdf * 1.0) * 
    //   ((*psi).lobePdfPrevVertex * (*psi).brdfPdfPrevVertex), 
    //   abs(dot(w_km1, ires.triangle.geometricNormal)) / dot(w_vec, w_vec)
    // );
    // pi.reconnectionRadiance = vec3f(0);
    // pi.reconnectionDirection = brdfDirectionSample.dir;
    // pi.flags = setPathFlags(lobeIndex, 0, 1, 1);
    
    // psi.reconnectionVertexIndex = debugInfo.bounce;
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

fn setReconnectionVertex(
  brdfDirectionSample: BrdfDirectionSample,
  ires: BVHIntersectionResult, 
  pi: ptr<function, PathInfo>,
  psi: ptr<function, PathSampleInfo>,
  lobeIndex: u32,
) {
  // if this is a reconnection vertex, we'll have to prepare
  // the jacobian such that successive bounces can use it 
  // while saving new pathinfos in the reservoir
  if (psi.reconnectionVertexIndex == -1) {
    let isRough = true;
    let isConnectible = psi.wasPrevVertexRough && isRough;

    let w_vec = psi.prevVertexPosition - ires.hitPoint;
    let w_km1 = normalize(w_vec);

    pi.reconnectionBounce = u32(debugInfo.bounce); // reconnects at xk, xk+1 is the light vertex
    pi.reconnectionTriangleIndex = ires.triangleIndex; 
    pi.reconnectionBarycentrics = ires.barycentrics;
    pi.jacobian = vec2f(
      (brdfDirectionSample.pdf * 1.0) * 
      ((*psi).lobePdfPrevVertex * (*psi).brdfPdfPrevVertex), 
      abs(dot(w_km1, ires.triangle.geometricNormal)) / dot(w_vec, w_vec)
    );
    pi.reconnectionRadiance = vec3f(0);
    pi.reconnectionDirection = brdfDirectionSample.dir;
    pi.flags = setPathFlags(lobeIndex, 0, 1, 1);

    psi.reconnectionVertexIndex = debugInfo.bounce;
  }
}
`;
