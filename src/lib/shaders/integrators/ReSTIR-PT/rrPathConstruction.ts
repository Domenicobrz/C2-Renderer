import { MATERIAL_TYPE } from '$lib/materials/material';

export let rrPathConstruction = /* wgsl */ `
fn rrEnvmapPathConstruction(
  pi: ptr<function, PathInfo>,
  lastBrdfMis: ptr<function, f32>, 
  throughput: ptr<function, vec3f>, 
  emissive: vec3f,
) -> RandomReplayResult {
  let unpackedFlags = unpackPathFlags((*pi).flags);
  let pathDoesNotReconnect = !unpackedFlags.reconnects;
  let pathIsBrdfSampled = unpackedFlags.brdfSampled;
  let pathEndsInEnvmap = unpackedFlags.endsInEnvmap;

  if (
    pathDoesNotReconnect &&
    pathIsBrdfSampled && 
    pathEndsInEnvmap && 
    u32(debugInfo.bounce) == pi.bounceCount
  ) {
    let mi = *lastBrdfMis; // will be 1 in this case
    let pHat = emissive * *throughput; // throughput will be 1 in this case

    var rrStepResult = RandomReplayResult(0, vec3f(0.0), false, vec2f(0.0));
    rrStepResult.valid = 1;
    rrStepResult.shouldTerminate = true;
    rrStepResult.jacobian = vec2f(1.0);
    rrStepResult.pHat = pHat * mi;

    return rrStepResult;
  } else {
    const failedShiftResult = RandomReplayResult(0, vec3f(0.0), true, vec2f(0.0));
    return failedShiftResult;
  }
}

fn rrPathConstruction(
  lightDirectionSample: LightDirectionSample,
  geometryContext: GeometryContext,
  material: EvaluatedMaterial,
  ires: BVHIntersectionResult, 
  throughput: ptr<function, vec3f>, 
  isRough: bool,
  pi: ptr<function, PathInfo>,
  psi: ptr<function, PathSampleInfo>,
  emissive: vec3f,
  lastBrdfMis: ptr<function, f32>, 
  lobeIndex: u32,
) -> RandomReplayResult {
  let ray = geometryContext.ray;
  let interpolatedAttributes = geometryContext.interpolatedAttributes;
  let normals = geometryContext.normals;
  let isBackFacing = geometryContext.isBackFacing;

  var rrStepResult = RandomReplayResult(0, vec3f(0.0), false, vec2f(0.0));
  const failedShiftResult = RandomReplayResult(0, vec3f(0.0), true, vec2f(0.0));

  let w_vec = psi.prevVertexPosition - ires.hitPoint;
  let isTooShort = isSegmentTooShortForReconnection(w_vec);
  var isCurrentVertexConnectible = psi.wasPrevVertexRough && isRough && !isTooShort;

  let unpackedFlags = unpackPathFlags((*pi).flags);
  let pathReconnects = unpackedFlags.reconnects;
  let pathDoesNotReconnect = !pathReconnects;
  let pathIsBrdfSampled = unpackedFlags.brdfSampled;
  let pathIsLightSampled = unpackedFlags.lightSampled;
  let pathReconnectionLobes = unpackedFlags.reconnectionLobes;
  let pathEndsInEnvmap = unpackedFlags.endsInEnvmap;
  
  // invertibility check
  if (isCurrentVertexConnectible && pathReconnects && u32(debugInfo.bounce) < pi.reconnectionBounce) {
    return failedShiftResult;
  }

  // invertibility check
  if (!isCurrentVertexConnectible && pathReconnects && u32(debugInfo.bounce) == pi.reconnectionBounce) {
    return failedShiftResult;
  }

  // invertibility check
  if (isCurrentVertexConnectible && pathDoesNotReconnect) {
    return failedShiftResult;
  }

  // pure random replay path
  if (pathDoesNotReconnect) {
    if (pathIsBrdfSampled && u32(debugInfo.bounce) == pi.bounceCount) {
      let mi = *lastBrdfMis; // will be 1 in this case
      let pHat = emissive * *throughput; // throughput will be 1 in this case

      rrStepResult.valid = 1;
      rrStepResult.shouldTerminate = true;
      rrStepResult.jacobian = vec2f(1.0);
      rrStepResult.pHat = pHat * mi;
      return rrStepResult;
    }
    if (pathIsLightSampled && u32(debugInfo.bounce + 1) == pi.bounceCount) {
      // let lightDirectionSample = sampleLight(material, ray, interpolatedAttributes, normals);
      let lightSampleRadiance = lightDirectionSample.ls.radiance;
      let lightSampleSuccessful = dot(lightSampleRadiance, lightSampleRadiance) > 0.0;
      
      if (lightSampleSuccessful) {
        var mi = lightDirectionSample.mis;
        let pHat = lightSampleRadiance * (1.0 / lightDirectionSample.pdf) * *throughput * 
                   lightDirectionSample.brdf * cosTerm(normals.shading, lightDirectionSample.dir, material.materialType);
    
        rrStepResult.valid = 1;
        rrStepResult.shouldTerminate = true;
        rrStepResult.jacobian = vec2f(1.0);
        rrStepResult.pHat = pHat * mi;
        return rrStepResult;
      }
    }
  }

  // directly hitting light source at bounce 0, no need to check if emissive > 0.0
  if (
    pi.bounceCount == 0 && debugInfo.bounce == 0 && !isBackFacing
  ) {
    let mi = *lastBrdfMis; // will be 1 in this case
    let pHat = emissive * *throughput; // throughput will be 1 in this case
    let wi = mi * length(pHat);

    rrStepResult.valid = 1;
    rrStepResult.shouldTerminate = true;
    rrStepResult.jacobian = vec2f(1.0);
    rrStepResult.pHat = pHat * mi;
    return rrStepResult;
  }

  // next vertex is the reconnection vertex, which is also a light source
  if (
    pathReconnectsAtLightVertex(*pi) && 
    pi.reconnectionBounce == u32(debugInfo.bounce+1)
  ) {
    let wasEnvmap = pathEndsInEnvmap;

    var w_vec = vec3f(0.0);
    var w_km1 = vec3f(0.0);
    var lsGeometricNormal = vec3f(0.0);
    var isTooShort = false;

    if (!wasEnvmap) {
      let triangle = triangles[pi.reconnectionTriangleIndex];
      let nextVertexPosition = sampleTrianglePoint(triangle, pi.reconnectionBarycentrics).point;
  
      // at the start of the function, we were trying to test if the current vertex was a reconnection
      // vertex, with the chance of it breaking invertibility. Now, we're considering the NEXT vertex
      // as the potential reconnection vertex, so we need to re-test for connectibility here. We'll
      // assume that the next vertex is rough enough and that it has the correct reconnection lobe,
      // because we know that Xk = Yk
      w_vec = nextVertexPosition - ires.hitPoint;
      w_km1 = normalize(w_vec);
      lsGeometricNormal = triangle.geometricNormal;
      isTooShort = isSegmentTooShortForReconnection(w_vec);
    } else {
      w_km1 = (*pi).radianceDirection;
      lsGeometricNormal = -w_km1;
      isTooShort = false;
    }

    // next vertex lobe will necessarily be identical since we're reconnecting to the same
    // xk, however for the previous vertex, xk-1, which is this vertex, we have to make this check
    let hasDifferentLobes = lobeIndex != pathReconnectionLobes.x;
    let isConnectible = isRough && !isTooShort && !hasDifferentLobes;

    if (!isConnectible) {
      return failedShiftResult;
    }

    let dir = w_km1;
    let visibilityRay = Ray(ires.hitPoint + dir * 0.0001, dir);

    // We're doing a bvh traversal here that is probably unnecessary.
    // However, fixing it would require us to return the ires struct from
    // getLightPdf and the runtime cost of copying those ires values every time,
    // for every integrator using getLightPdf, 
    // is not worth the added benefit of simplifying this call here.
    // The alternative would be to have a different version of the bvh.ts shader 
    // for ReSTIR PT where instead of using getLightPdf we would use getLightPdfAndIRes
    // even that however seems too much effort for relatively little gain
    let visibilityRes = bvhIntersect(visibilityRay);
    
    if (!wasEnvmap) {
      // in this case, we have to check wether the light source is backfacing, since it's the next vertex
      let backFacing = dot(-dir, visibilityRes.triangle.geometricNormal) < 0;
      if (!visibilityRes.hit || pi.reconnectionTriangleIndex != visibilityRes.triangleIndex || backFacing) {
        // shift failed, should terminate
        return failedShiftResult;
      }
    } else {
      if (visibilityRes.hit) {
        // shift failed, we should have hit an envmap instead
        return failedShiftResult;
      }
    }
    
    // reconnection is successful
    let probability_of_sampling_lobe = 1.0;

    var wo = -ray.direction;
    var wi = w_km1;
    transformToLocalSpace(&wo, &wi, geometryContext);

    let brdf = evaluateBrdf(
      material, wo, wi, geometryContext
    );
    let brdfPdf = evaluateLobePdf(
      material, wo, wi, geometryContext
    );
    let lightPdf = getLightPDF(Ray(ires.hitPoint + w_km1 * 0.0001, w_km1));

    var p = 1.0;
    var mi = 0.0; 
    if (pathIsBrdfSampled) {
      p *= brdfPdf * probability_of_sampling_lobe;
      mi = getMisWeight(brdfPdf, lightPdf);
      // emitters have no mi. This however should be fixed. Also notice how here we're looking for
      // reconnection lobe x, whereas in the next case we'll be checking lobe y 
      if (pathReconnectionLobes.x == u32(${MATERIAL_TYPE.EMISSIVE})) {  
        mi = 1.0;
      }
    }
    if (pathIsLightSampled) {
      p *= lightPdf * probability_of_sampling_lobe;
      mi = getMisWeight(lightPdf, brdfPdf);
    }

    if (p <= 0.0) {
      // shift failed, should terminate
      return failedShiftResult;
    }

    var jacobian = vec2f(
      p, 
      abs(dot(w_km1, lsGeometricNormal)) / dot(w_vec, w_vec)
    );

    if (wasEnvmap) {
      jacobian.y = 1.0;  // explanation on envmapJacobian.md
    }

    let pHat = pi.reconnectionRadiance * (1.0 / p) * *throughput * 
               brdf * cosTerm(normals.shading, w_km1, material.materialType);

    rrStepResult.valid = 1;
    rrStepResult.shouldTerminate = true;
    rrStepResult.jacobian = jacobian;
    rrStepResult.pHat = pHat * mi;
    return rrStepResult;
  }

  // next vertex is the reconnection vertex and the path ends on the vertex after that
  let case2 = pathReconnectsOneVertextBeforeLight(*pi) && pi.reconnectionBounce == u32(debugInfo.bounce+1);
  // next vertex is the reconnection vertex and the path ends far from light source
  let case3 = pathReconnectsFarFromLightVertex(*pi) && pi.reconnectionBounce == u32(debugInfo.bounce+1);

  if (case2 || case3) {
    let triangle = triangles[pi.reconnectionTriangleIndex];
    let nextVertexPosition = sampleTrianglePoint(triangle, pi.reconnectionBarycentrics).point;
    
    // at the start of the function, we were trying to test if the current vertex was a reconnection
    // vertex, with the chance of it breaking invertibility. Now, we're considering the NEXT vertex
    // as the potential reconnection vertex, so we need to re-test for connectibility here. We'll
    // assume that the next vertex is rough enough and that it has the correct reconnection lobe,
    // because we know that Xk = Yk
    let w_vec = nextVertexPosition - ires.hitPoint;
    let isTooShort = isSegmentTooShortForReconnection(w_vec);
    // next vertex lobe will necessarily be identical since we're reconnecting to the same
    // xk, however for the previous vertex, xk-1, which is this vertex, we have to make this check
    let hasDifferentLobes = lobeIndex != pathReconnectionLobes.x;
    let isConnectible = isRough && !isTooShort && !hasDifferentLobes;
    
    if (!isConnectible) {
      // shift failed, should terminate
      return failedShiftResult;
    }

    let dir = normalize(nextVertexPosition - ires.hitPoint);
    var visibilityRay = Ray(ires.hitPoint + dir * 0.0001, dir);
   
    // we can't use the lightPdf call here to also do the intersection since
    // the lightPdf checks the intersection between xk and xk+1, but the reconnection
    // direction is between xk-1 and xk
    let visibilityRes = bvhIntersect(visibilityRay);

    // in this case, we DON'T have to check wether the next vertex is backfacing, since it's NOT the light source
    // let backFacing = dot(-dir, visibilityRes.triangle.geometricNormal) < 0;
    if (!visibilityRes.hit || pi.reconnectionTriangleIndex != visibilityRes.triangleIndex) {
      // shift failed, should terminate
      return failedShiftResult;
    }

    // reconnection is successful
    let w_km1 = normalize(w_vec);
    let probability_of_sampling_lobe = 1.0;
    
    var wo = -ray.direction;
    var wi = w_km1;
    transformToLocalSpace(&wo, &wi, geometryContext);

    let brdf = evaluateBrdf(
      material, wo, wi, geometryContext
    );
    let brdfPdf = evaluateLobePdf(
      material, wo, wi, geometryContext
    );
    var p = probability_of_sampling_lobe * brdfPdf;

    // pick surface information of vertex Xk
    var materialXk = EvaluatedMaterial();
    var geometryContextXk = GeometryContext();
    evaluateMaterialAndGeometryContext(visibilityRes, visibilityRay, &materialXk, &geometryContextXk, false);
    let normalsXk = geometryContextXk.normals;

    var woXk = -w_km1;
    var wiXk = pi.radianceDirection;
    transformToLocalSpace(&woXk, &wiXk, geometryContextXk);

    let brdfXk = evaluateBrdf(
      materialXk, woXk, wiXk, geometryContextXk
    );
    let brdfPdfXk = evaluateLobePdf(
      materialXk, woXk, wiXk, geometryContextXk
    );

    var mi = 0.0;
    if (case2) {
      let lightPdfXk = getLightPDF(Ray(visibilityRes.hitPoint + pi.radianceDirection * 0.0001, pi.radianceDirection));
  
      if (pathIsBrdfSampled) {
        p *= brdfPdfXk * probability_of_sampling_lobe;
        mi = getMisWeight(brdfPdfXk, lightPdfXk);
  
        // emitters have no mi. This however should be fixed
        if (pathReconnectionLobes.y == u32(${MATERIAL_TYPE.EMISSIVE})) {  
          mi = 1.0;
        }
      }
      if (pathIsLightSampled) {
        p *= lightPdfXk * probability_of_sampling_lobe;
        mi = getMisWeight(lightPdfXk, brdfPdfXk);
      }
    } else if (case3) {
      mi = 1.0; // no mis weights since this part of the path is brdf-only
      p *= brdfPdfXk * probability_of_sampling_lobe;
    }

    if (p <= 0.0) {
      // shift failed, should terminate
      return failedShiftResult;
    }

    // absorption check for dielectrics
    if (materialXk.materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
      var isInsideMedium = dot(normalsXk.shading, w_km1) > 0;
      if (isInsideMedium) {
        let t = length(w_vec);
        let absorption = vec3f(
          exp(-materialXk.absorptionCoefficient.x * t), 
          exp(-materialXk.absorptionCoefficient.y * t), 
          exp(-materialXk.absorptionCoefficient.z * t), 
        );
        *throughput *= absorption;
      }
    }

    var jacobian = vec2f(
      p, 
      abs(dot(w_km1, triangle.geometricNormal)) / dot(w_vec, w_vec)
    );
  
    let pHat = pi.reconnectionRadiance * (1.0 / p) * *throughput * 
               brdf * brdfXk * cosTerm(normals.shading, w_km1, material.materialType) * 
               cosTerm(normalsXk.shading, pi.radianceDirection, materialXk.materialType);

    rrStepResult.valid = 1;
    rrStepResult.shouldTerminate = true;
    rrStepResult.jacobian = jacobian;
    rrStepResult.pHat = pHat * mi;
    return rrStepResult;
  }

  return rrStepResult;
}
`;
