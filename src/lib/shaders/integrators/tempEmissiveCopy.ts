export const tempEmissiveCopy = /* wgsl */ `
fn shadeEmissive(
  ires: BVHIntersectionResult, 
  ray: ptr<function, Ray>,
  reservoir: ptr<function, Reservoir>,
  throughput: ptr<function, vec3f>, 
  pi: PathInfo,
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

  let emissive = material.color * material.intensity;
  const albedo = vec3f(1,1,1);
  const brdfPdf = 1 / (2 * PI);
  const brdf = (1 / PI);
  const lobeIndex: u32 = 2;

  var rrStepResult = RandomReplayResult(0, vec3f(0.0), false, vec2f(0.0));

  var N = ires.triangle.geometricNormal;
  if (dot(N, (*ray).direction) > 0) {
    N = -N;
  } else {
    if (!isRandomReplay) {
      let mi = *lastBrdfMis;
      // let mi = 1.0;
      let pHat = emissive * *throughput;
      let Wxi = 1.0;
      let wi = mi * length(pHat) * Wxi;

      let isConnectible = psi.wasPrevVertexRough; // we'll assume they're both rough and distant enough
      let w_vec = ires.hitPoint - psi.prevVertexPosition;
      let w_km1 = normalize(w_vec);
      let p = psi.brdfPdfPrevVertex * psi.lobePdfPrevVertex;
      var jacobian = vec2f(
        p, 
        abs(dot(w_km1, ires.triangle.geometricNormal)) / dot(w_vec, w_vec)
      );

      // directly hitting a light source at bounce 0
      if (debugInfo.bounce == 0) {
        jacobian = vec2f(1.0);
      }

      let pathInfo = PathInfo(
        pHat * mi,
        vec2i(tid.xy),
        u32(debugInfo.bounce),
        // set flags to "BRDF sampled"
        setPathFlags(
          lobeIndex, 0, 1, select(NO_RECONNECTION, RECONNECTION_AT_LS, isConnectible)
        ),
        debugInfo.bounce - 1, 
        ires.triangleIndex, 
        ires.barycentrics, 
        emissive, 
        // vec2f(1.0), // jacobian
        jacobian
      );
    
      // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
      updateReservoir(reservoir, pathInfo, wi);
    }

    if (isRandomReplay) {
      // directly hitting light source at bounce 0
      if (pi.bounceCount == 0 && debugInfo.bounce == 0) {
        let mi = *lastBrdfMis; // will be 1 in this case
        let pHat = emissive * *throughput; // throughput will be 1 in this case
        let wi = mi * length(pHat);

        rrStepResult.valid = 1;
        rrStepResult.shouldTerminate = true;
        rrStepResult.jacobian = vec2f(1.0);
        rrStepResult.pHat = pHat * mi;
        return rrStepResult;
      }

      // next vertex is reconnection vertex, this is effectively the case: lightsource -> lightsource
      if (pi.reconnectionBounce == debugInfo.bounce) {    
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

        var p = brdfPdf;
        var mi = 1.0;
        let lightPdf = getLightPDF(Ray(ires.hitPoint + w_km1 * 0.0001, w_km1));

        let jacobian = vec2f(
          p * probability_of_sampling_lobe, 
          abs(dot(w_km1, triangle.geometricNormal)) / dot(w_vec, w_vec)
        );
      
        let pHat = pi.reconnectionRadiance * (1.0 / p) * *throughput * 
                   brdf * max(dot(N, dir), 0.0);

        rrStepResult.valid = 1;
        rrStepResult.shouldTerminate = true;
        // rrStepResult.jacobian = vec2f(1.0);
        rrStepResult.jacobian = jacobian;
        rrStepResult.pHat = pHat * mi;
        return rrStepResult;
      }

      if (
        pathDoesNotReconnect(pi) && 
        pi.bounceCount == u32(debugInfo.bounce) && 
        pathIsBrdfSampled(pi) && 
        pathHasLobeIndex(pi, lobeIndex)
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

  (*ray).origin = ires.hitPoint - (*ray).direction * 0.001;

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
  (*ray).direction = normalize(TBN * nd.xzy);

  *throughput *= albedo * max(dot(N, (*ray).direction), 0.0) * brdf * (1 / brdfPdf);
  *lastBrdfMis = 1.0;
  *psi = PathSampleInfo(
    true,
    ires.hitPoint,
    brdfPdf,
    1.0,
  );

  return rrStepResult;
} 
`;
