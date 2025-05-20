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
  isRough: bool,
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>,
  N: vec3f,
  tid: vec3u,
) {
  let lightPointSample = lightDirectionSample.ls;
  let lightSampleRadiance = lightPointSample.radiance;

  // if we haven't found a reconnection vertex, 
  // try to create and save a NEE path, if it's not possible
  // create a pure random-replay path
  if ((*psi).reconnectionVertexIndex == -1) {
    var mi = lightDirectionSample.mis;
    let pHat = lightSampleRadiance * (1.0 / lightDirectionSample.pdf) * *throughput * 
               lightDirectionSample.brdf * cosTerm(N, lightDirectionSample.dir, materialData[0]);
    let Wxi = 1.0;
    let wi = mi * length(pHat) * Wxi;

    let w_vec = lightPointSample.hitPoint - ires.hitPoint;

    // since we're creating the reconnection vertex here, we also have to check the distance condition
    var isTooShort = isSegmentTooShortForReconnection(w_vec);
    let isEnvmap = lightPointSample.isEnvmap;
    if (isEnvmap) {
      isTooShort = false;
    }

    let isConnectible = !isTooShort && isRough; 

    if (isConnectible) {
      let w_km1 = normalize(w_vec);
      let probability_of_sampling_lobe = 1.0;
      let p = lightDirectionSample.pdf * probability_of_sampling_lobe;
      var jacobian = vec2f(p, abs(dot(w_km1, lightPointSample.geometricNormal)) / dot(w_vec, w_vec));
  
      if (isEnvmap) {
        jacobian.y = 1.0;  // explanation on envmapJacobian.md
      }

      let pathInfo = PathInfo(
        pHat * mi,
        pi.seed,
        pi.seed,
        u32(debugInfo.bounce + 1),
        setPathFlags(lobeIndex, 1, 0, u32(select(0, 1, isEnvmap)), 1), // set flags to "path ends by NEE" and "reconnects"
        u32(debugInfo.bounce + 1),        // reconnects at xk, which is the light vertex
        lightPointSample.triangleIndex, 
        lightPointSample.barycentrics, 
        lightPointSample.radiance, 
        lightDirectionSample.dir,  // used in rrPathConstruction when hitting envmaps
        jacobian,
        vec2i(i32(lobeIndex), 2)
      );
    
      // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
      updateReservoir(reservoir, pathInfo, wi);
    } else {
      // non reconnectible path, we'll do pure Random-replay
      let pathInfo = PathInfo(
        pHat * mi,
        pi.seed,
        pi.seed,
        u32(debugInfo.bounce + 1),
        // set flags to "path ends by NEE" and "doesn't reconnect"
        setPathFlags(lobeIndex, 1, 0, u32(select(0, 1, isEnvmap)), 0), 
        0,        
        -1, 
        vec2f(0), 
        vec3f(0), 
        vec3f(0),
        vec2f(1.0),
        vec2i(-1, -1) 
      );
    
      // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
      updateReservoir(reservoir, pathInfo, wi);
    }
  }

  // if this vertex is a reconnection vertex, use the light-sample path as a candidate. 
  // Also, prepare the jacobian for the possible brdf-path candidates that might arrive 
  // at the next bounce
  if (psi.reconnectionVertexIndex == debugInfo.bounce) {
    var mi = lightDirectionSample.mis;
    let pHat = lightSampleRadiance * (1.0 / lightDirectionSample.pdf) * *throughput * 
               lightDirectionSample.brdf * cosTerm(N, lightDirectionSample.dir, materialData[0]);
    let Wxi = 1.0;
    let wi = mi * length(pHat) * Wxi;

    let isEnvmap = lightPointSample.isEnvmap;

    let w_vec = psi.prevVertexPosition - ires.hitPoint;
    let w_km1 = normalize(w_vec);
    let probability_of_sampling_lobe = 1.0;
    let p = (lightDirectionSample.pdf * probability_of_sampling_lobe) * 
            ((*psi).lobePdfPrevVertex * (*psi).brdfPdfPrevVertex);
    let jacobian = vec2f(p, abs(dot(w_km1, ires.triangle.geometricNormal)) / dot(w_vec, w_vec));
  
    // the reason why we're saving a copy is explained in shaders/integrators/doc2.md
    var piCopy = *pi;
    piCopy.F = pHat * mi;
    piCopy.bounceCount = u32(debugInfo.bounce + 1);
    // v v v v v v v saved in another function v v v v v v v 
    // pi.reconnectionBounce = u32(debugInfo.bounce); // reconnects at xk, xk+1 is the light vertex
    // pi.reconnectionTriangleIndex = ires.triangleIndex; 
    // pi.reconnectionBarycentrics = ires.barycentrics; 
    piCopy.flags = setPathFlags(lobeIndex, 1, 0, u32(select(0, 1, isEnvmap)), 1); // set flags to "path ends by NEE" and "reconnects"
    piCopy.reconnectionRadiance = lightPointSample.radiance; 
    piCopy.reconnectionDirection = lightDirectionSample.dir;
    piCopy.jacobian = jacobian;
    
    // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
    updateReservoir(reservoir, piCopy, wi);
  }

  // if we have already found a reconnection vertex previously
  if (
    (*psi).reconnectionVertexIndex != -1 && 
    (*psi).reconnectionVertexIndex < debugInfo.bounce
  ) {
    var mi = lightDirectionSample.mis;
    let lsThroughput = (lightDirectionSample.brdf / lightDirectionSample.pdf) *
      cosTerm(N, lightDirectionSample.dir, materialData[0]);
    let pHat = lightSampleRadiance * lsThroughput * *throughput;
               
    let Wxi = 1.0;
    let wi = mi * length(pHat) * Wxi;
      
    var piCopy = *pi;
    piCopy.F = pHat * mi;
    piCopy.bounceCount = u32(debugInfo.bounce + 1);
    // for this type of path ending, we have to multiply the reconnectionRadiance by mi
    piCopy.reconnectionRadiance = lightSampleRadiance * psi.postfixThroughput * lsThroughput * mi;

    // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
    updateReservoir(reservoir, piCopy, wi);
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
      pi.seed,
      pi.seed,
      u32(debugInfo.bounce),
      setPathFlags(lobeIndex, 0, 1, 0, 0), // set flags to "path ends by NEE" and "doesn't reconnect"
      0,        
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

  // if we haven't found a reconnection vertex, (which also means this vertex couldn't  
  // be used as a reconnection vertex) then save a pure RR path   
  if ((*psi).reconnectionVertexIndex == -1) {
    let mi = *lastBrdfMis; // will be 1 in this case
    let pHat = emissive * *throughput; // throughput will be 1 in this case
    let wi = mi * length(pHat);

    // non reconnectible path, we'll do pure Random-replay
    let pathInfo = PathInfo(
      pHat * mi,
      pi.seed,
      pi.seed,
      u32(debugInfo.bounce),
      // set flags to "path ends by BRDF" and "doesn't reconnect"
      setPathFlags(lobeIndex, 0, 1, 0, 0), 
      0,        
      -1, 
      vec2f(0), 
      vec3f(0), 
      vec3f(0),
      vec2f(1.0),
      vec2i(-1, -1) // 2 is the emissive lobe-index
    );
  
    // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
    updateReservoir(reservoir, pathInfo, wi);
  }

  // if this vertex is a reconnection vertex, and we haven't found another one sooner,
  // use this path as a candidate, and save reconnection information
  // for potential future candidates
  if (psi.reconnectionVertexIndex == debugInfo.bounce) {
    let mi = *lastBrdfMis;
    let pHat = emissive * *throughput;
    let Wxi = 1.0;
    let wi = mi * length(pHat) * Wxi;

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

    // the reason why we're saving a copy is explained in shaders/integrators/doc2.md
    var piCopy = *pi;
    piCopy.F = pHat * mi;
    piCopy.bounceCount = u32(debugInfo.bounce);
    // v v v v v v v saved in another function v v v v v v v 
    // pi.reconnectionBounce = u32(debugInfo.bounce); // reconnects at xk, xk+1 is the light vertex
    // pi.reconnectionTriangleIndex = ires.triangleIndex; 
    // pi.reconnectionBarycentrics = ires.barycentrics;
    // these last elements will be updated by Emissive for the brdf
    // path
    piCopy.flags = setPathFlags(lobeIndex, 0, 1, 0, 1); // set flags to "path ends by BRDF" and "reconnects"
    piCopy.reconnectionRadiance = emissive; 
    piCopy.jacobian = jacobian;

    // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
    updateReservoir(reservoir, piCopy, wi);
  }

  // if the previous vertex is the reconnection vertex
  if (
    (*psi).reconnectionVertexIndex != -1 &&
    (*psi).reconnectionVertexIndex == (debugInfo.bounce-1)
  ) {
    var mi = *lastBrdfMis;
    let pHat = emissive * *throughput;

    var piCopy = *pi;
    // the jacobian has already been calculated in the previous vertex, we don't need to add to it here.
    // the previous bounce handled the rest
    // *****ERROR***** here I'm setting a lobeIndex that is overwriting what should be stored in the path's flags
    // *****ERROR***** here I'm setting a lobeIndex that is overwriting what should be stored in the path's flags
    // *****ERROR***** here I'm setting a lobeIndex that is overwriting what should be stored in the path's flags
    // *****ERROR***** here I'm setting a lobeIndex that is overwriting what should be stored in the path's flags
    piCopy.flags = setPathFlags(lobeIndex, 0, 1, 0, 1);
    piCopy.F = pHat * mi;
    piCopy.bounceCount = u32(debugInfo.bounce);
    piCopy.reconnectionRadiance = emissive;
    
    let Wxi = 1.0;
    let wi = mi * length(pHat) * Wxi;
      
    // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
    updateReservoir(reservoir, piCopy, wi);
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
      
    var piCopy = *pi;
    piCopy.F = pHat * mi;
    piCopy.bounceCount = u32(debugInfo.bounce);
    // for this type of path ending, we have to multiply the reconnectionRadiance by mi
    piCopy.reconnectionRadiance = psi.postfixThroughput * emissive * mi;

    // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
    updateReservoir(reservoir, piCopy, wi);
  }
}

fn envmapPathConstruction(
  reservoir: ptr<function, Reservoir>,
  throughput: ptr<function, vec3f>, 
  pi: ptr<function, PathInfo>,
  psi: ptr<function, PathSampleInfo>,
  lastBrdfMis: ptr<function, f32>, 
  emissive: vec3f,
) {
  // if we haven't found a reconnection vertex, (we'll also assume we can't use the escaped path  
  // as a reconnection vertex) then save a pure RR path   
  if ((*psi).reconnectionVertexIndex == -1) {
    let mi = *lastBrdfMis; // will be 1 in this case
    let pHat = emissive * *throughput; // throughput will be 1 in this case
    let wi = mi * length(pHat);

    // non reconnectible path, we'll do pure Random-replay
    let pathInfo = PathInfo(
      pHat * mi,
      pi.seed,
      pi.seed,
      u32(debugInfo.bounce),
      // set flags to "path ends by BRDF" and "doesn't reconnect"
      setPathFlags(0, 0, 1, 1, 0), 
      0,        
      -1, 
      vec2f(0), 
      vec3f(0), 
      vec3f(0),
      vec2f(1.0),
      vec2i(-1, -1) // 2 is the emissive lobe-index
    );
  
    // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
    updateReservoir(reservoir, pathInfo, wi);
  }

  // if the previous vertex is the reconnection vertex
  if (
    (*psi).reconnectionVertexIndex != -1 &&
    (*psi).reconnectionVertexIndex == (debugInfo.bounce-1)
  ) {
    var mi = *lastBrdfMis;
    let pHat = emissive * *throughput;

    var piCopy = *pi;
    // I can't set all the flags here since I would overwrite the rec. vertex lobeIndex
    // I don't think this flag is necessary though since we're not checking for it
    // in rrPathConstruction for the "one before light" reconnection case   
    piCopy.flags = setEndsInEnvmapFlag(piCopy.flags, true);
    piCopy.F = pHat * mi;
    piCopy.bounceCount = u32(debugInfo.bounce);
    piCopy.reconnectionRadiance = emissive;
    // the jacobian has already been calculated in the previous vertex, we don't need to add to it here.
    // the previous bounce handled the rest

    let Wxi = 1.0;
    let wi = mi * length(pHat) * Wxi;

    // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
    updateReservoir(reservoir, piCopy, wi);
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
      
    var piCopy = *pi;
    piCopy.F = pHat * mi;
    piCopy.bounceCount = u32(debugInfo.bounce);
    // for this type of path ending, we have to multiply the reconnectionRadiance by mi
    piCopy.reconnectionRadiance = psi.postfixThroughput * emissive * mi;

    // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
    updateReservoir(reservoir, piCopy, wi);
  } 
}

fn setReconnectionVertex(
  brdfDirectionSample: BrdfDirectionSample,
  ires: BVHIntersectionResult, 
  pi: ptr<function, PathInfo>,
  psi: ptr<function, PathSampleInfo>,
  lobeIndex: u32,
  isRough: bool,
  tid: vec3u,
) {
  let isTooShort = isSegmentTooShortForReconnection(psi.prevVertexPosition - ires.hitPoint);
  let isConnectible = psi.wasPrevVertexRough && isRough && !isTooShort;
  
  // if this is a reconnection vertex, we'll have to prepare
  // the jacobian such that successive bounces can use it 
  // while saving new pathinfos in the reservoir
  if (psi.reconnectionVertexIndex == -1 && isConnectible) {
    let w_vec = psi.prevVertexPosition - ires.hitPoint;
    let w_km1 = normalize(w_vec);

    pi.reconnectionLobes = vec2i(psi.prevLobeIndex, i32(lobeIndex));
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
    pi.flags = setPathFlags(lobeIndex, 0, 1, 0, 1);

    psi.reconnectionVertexIndex = debugInfo.bounce;
  }
}
`;
