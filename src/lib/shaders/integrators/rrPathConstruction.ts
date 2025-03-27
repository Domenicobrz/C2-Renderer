import { MATERIAL_TYPE } from '$lib/materials/material';

export let rrPathConstruction = /* wgsl */ `
fn rrPathConstruction(
  // lightDirectionSample: LightDirectionSample,
  // brdfDirectionSample: BrdfDirectionSample,
  surfaceAttributes: SurfaceAttributes,
  normals: SurfaceNormals,
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>,
  ires: BVHIntersectionResult, 
  ray: ptr<function, Ray>,
  // reservoir: ptr<function, Reservoir>,
  throughput: ptr<function, vec3f>, 
  isRough: bool,
  pi: ptr<function, PathInfo>,
  psi: ptr<function, PathSampleInfo>,
  isBackFacing: bool,
  emissive: vec3f,
  lastBrdfMis: ptr<function, f32>, 
  lobeIndex: u32,
  // N: vec3f,
  // tid: vec3u,
) -> RandomReplayResult {
  var rrStepResult = RandomReplayResult(0, vec3f(0.0), false, vec2f(0.0));

  let w_vec = psi.prevVertexPosition - ires.hitPoint;
  let isTooShort = isSegmentTooShortForReconnection(w_vec);
  var isCurrentVertexConnectible = psi.wasPrevVertexRough && isRough && !isTooShort;
  
  // invertibility check
  if (isCurrentVertexConnectible && pathReconnects(*pi) && u32(debugInfo.bounce) < pi.reconnectionBounce) {
    rrStepResult.valid = 0;
    rrStepResult.shouldTerminate = true;
    return rrStepResult;
  }

  // invertibility check
  if (isCurrentVertexConnectible && pathDoesNotReconnect(*pi)) {
    rrStepResult.valid = 0;
    rrStepResult.shouldTerminate = true;
    return rrStepResult;
  }

  // pure random replay path
  if (pathDoesNotReconnect(*pi)) {
    if (pathIsBrdfSampled(*pi) && u32(debugInfo.bounce) == pi.bounceCount) {
      let mi = *lastBrdfMis; // will be 1 in this case
      let pHat = emissive * *throughput; // throughput will be 1 in this case

      rrStepResult.valid = 1;
      rrStepResult.shouldTerminate = true;
      rrStepResult.jacobian = vec2f(1.0);
      rrStepResult.pHat = pHat * mi;
      return rrStepResult;
    }
    if (pathIsLightSampled(*pi) && u32(debugInfo.bounce + 1) == pi.bounceCount) {
      let lightDirectionSample = sampleLight(materialData, ray, surfaceAttributes, normals);
      let lightSampleRadiance = lightDirectionSample.ls.radiance;
      let lightSampleSuccessful = dot(lightSampleRadiance, lightSampleRadiance) > 0.0;
      
      if (lightSampleSuccessful) {
        var mi = lightDirectionSample.mis;
        let pHat = lightSampleRadiance * (1.0 / lightDirectionSample.pdf) * *throughput * 
                   lightDirectionSample.brdf * cosTerm(normals.shading, lightDirectionSample.dir, materialData[0]);
    
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
    let hasDifferentLobes = i32(lobeIndex) != pi.reconnectionLobes.x;
    let isConnectible = isRough && !isTooShort && !hasDifferentLobes;

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
    let w_km1 = normalize(w_vec);
    let probability_of_sampling_lobe = 1.0;


    var wo = -(*ray).direction;
    var wi = w_km1;
    transformToLocalSpace(&wo, &wi, surfaceAttributes, normals);

    let brdf = evaluateBrdf(
      materialData, wo, wi, surfaceAttributes, normals
    );
    let brdfPdf = evaluateLobePdf(
      materialData, wo, wi, surfaceAttributes, normals
    );
    let lightPdf = getLightPDF(Ray(ires.hitPoint + w_km1 * 0.0001, w_km1));

    var p = 1.0;
    var mi = 0.0; 
    if (pathIsBrdfSampled(*pi)) {
      p *= brdfPdf * probability_of_sampling_lobe;
      mi = getMisWeight(brdfPdf, lightPdf);
      // emitters have no mi. This however should be fixed. Also notice how here we're looking for
      // reconnection lobe x, whereas in the next case we'll be checking lobe y 
      if (pi.reconnectionLobes.x == 2) {  
        mi = 1.0;
      }
    }
    if (pathIsLightSampled(*pi)) {
      p *= lightPdf * probability_of_sampling_lobe;
      mi = getMisWeight(lightPdf, brdfPdf);
    }

    if (p <= 0.0) {
      // shift failed, should terminate
      // shift failed, should terminate
      // shift failed, should terminate
      // shift failed, should terminate
      rrStepResult.valid = 0;
      rrStepResult.shouldTerminate = true;
      return rrStepResult;
    }

    var jacobian = vec2f(
      p, 
      abs(dot(w_km1, triangle.geometricNormal)) / dot(w_vec, w_vec)
    );
    let pHat = pi.reconnectionRadiance * (1.0 / p) * *throughput * 
               brdf * cosTerm(normals.shading, w_km1, materialData[0]);

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
    
    // at the start of the function, we were trying to test if the current vertex was a reconnection
    // vertex, with the chance of it breaking invertibility. Now, we're considering the NEXT vertex
    // as the potential reconnection vertex, so we need to re-test for connectibility here. We'll
    // assume that the next vertex is rough enough and that it has the correct reconnection lobe,
    // because we know that Xk = Yk
    let w_vec = nextVertexPosition - ires.hitPoint;
    let isTooShort = isSegmentTooShortForReconnection(w_vec);
    // next vertex lobe will necessarily be identical since we're reconnecting to the same
    // xk, however for the previous vertex, xk-1, which is this vertex, we have to make this check
    let hasDifferentLobes = i32(lobeIndex) != pi.reconnectionLobes.x;
    let isConnectible = isRough && !isTooShort && !hasDifferentLobes;
    
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
    var visibilityRay = Ray(ires.hitPoint + dir * 0.0001, dir);
   
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
    let w_km1 = normalize(w_vec);
    let probability_of_sampling_lobe = 1.0;
    
    var wo = -(*ray).direction;
    var wi = w_km1;
    transformToLocalSpace(&wo, &wi, surfaceAttributes, normals);

    let brdf = evaluateBrdf(
      materialData, wo, wi, surfaceAttributes, normals
    );
    let brdfPdf = evaluateLobePdf(
      materialData, wo, wi, surfaceAttributes, normals
    );
    var p = probability_of_sampling_lobe * brdfPdf;


    // pick surface information of vertex Xk
    let surfaceXk = SurfaceDescriptor(visibilityRes.triangleIndex, visibilityRes.barycentrics); 
    let surfaceAttributesXk = getSurfaceAttributes(triangle, visibilityRes.barycentrics);
    let materialDataXk = evaluateMaterialAtSurfacePoint(surfaceXk, surfaceAttributesXk);
    var bumpOffset: f32; var isBackFacing: bool;
    let normalsXk = getNormalsAtPoint(
      materialDataXk, &visibilityRay, surfaceAttributesXk, triangle, &bumpOffset, &isBackFacing,
    );

    var woXk = -w_km1;
    var wiXk = pi.reconnectionDirection;
    transformToLocalSpace(&woXk, &wiXk, surfaceAttributesXk, normalsXk);

    let brdfXk = evaluateBrdf(
      materialDataXk, woXk, wiXk, surfaceAttributesXk, normalsXk
    );
    let brdfPdfXk = evaluateLobePdf(
      materialDataXk, woXk, wiXk, surfaceAttributesXk, normalsXk
    );
    let lightPdfXk = getLightPDF(Ray(visibilityRes.hitPoint + pi.reconnectionDirection * 0.0001, pi.reconnectionDirection));
    var mi = 0.0;

    if (pathIsBrdfSampled(*pi)) {
      p *= brdfPdfXk * probability_of_sampling_lobe;
      mi = getMisWeight(brdfPdfXk, lightPdfXk);

      // emitters have no mi. This however should be fixed
      if (pi.reconnectionLobes.y == 2) {  
        mi = 1.0;
      }
    }
    if (pathIsLightSampled(*pi)) {
      p *= lightPdfXk * probability_of_sampling_lobe;
      mi = getMisWeight(lightPdfXk, brdfPdfXk);
    }

    if (p <= 0.0) {
      // shift failed, should terminate
      // shift failed, should terminate
      // shift failed, should terminate
      // shift failed, should terminate
      rrStepResult.valid = 0;
      rrStepResult.shouldTerminate = true;
      return rrStepResult;
    }

    // absorption check for dielectrics
    if (materialDataXk[0] == ${MATERIAL_TYPE.DIELECTRIC}) {
      var isInsideMedium = dot(normalsXk.shading, w_km1) > 0;
      if (isInsideMedium) {
        let t = length(w_vec);
        let absorption = vec3f(
          exp(-materialDataXk[1] * t), 
          exp(-materialDataXk[2] * t), 
          exp(-materialDataXk[3] * t), 
        );
        *throughput *= absorption;
      }
    }

    var jacobian = vec2f(
      p, 
      abs(dot(w_km1, triangle.geometricNormal)) / dot(w_vec, w_vec)
    );
  
    let pHat = pi.reconnectionRadiance * (1.0 / p) * *throughput * 
               brdf * brdfXk * cosTerm(normals.shading, w_km1, materialData[0]) * 
               cosTerm(normalsXk.shading, pi.reconnectionDirection, materialDataXk[0]);

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
  
    // at the start of the function, we were trying to test if the current vertex was a reconnection
    // vertex, with the chance of it breaking invertibility. Now, we're considering the NEXT vertex
    // as the potential reconnection vertex, so we need to re-test for connectibility here. We'll
    // assume that the next vertex is rough enough and that it has the correct reconnection lobe,
    // because we know that Xk = Yk
    let w_vec = nextVertexPosition - ires.hitPoint;
    let isTooShort = isSegmentTooShortForReconnection(w_vec);
    // next vertex lobe will necessarily be identical since we're reconnecting to the same
    // xk, however for the previous vertex, xk-1, which is this vertex, we have to make this check
    let hasDifferentLobes = i32(lobeIndex) != pi.reconnectionLobes.x;
    let isConnectible = isRough && !isTooShort && !hasDifferentLobes;
  
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
    var visibilityRay = Ray(ires.hitPoint + dir * 0.0001, dir);
  
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
    let w_km1 = normalize(w_vec);
    let probability_of_sampling_lobe = 1.0;
  
    var wo = -(*ray).direction;
    var wi = w_km1;
    transformToLocalSpace(&wo, &wi, surfaceAttributes, normals);

    let brdf = evaluateBrdf(
      materialData, wo, wi, surfaceAttributes, normals
    );
    let brdfPdf = evaluateLobePdf(
      materialData, wo, wi, surfaceAttributes, normals
    );
    var p = probability_of_sampling_lobe * brdfPdf;

    // now calculate probabilities for vertex xk
    let surfaceXk = SurfaceDescriptor(visibilityRes.triangleIndex, visibilityRes.barycentrics); 
    let surfaceAttributesXk = getSurfaceAttributes(triangle, visibilityRes.barycentrics);
    let materialDataXk = evaluateMaterialAtSurfacePoint(surfaceXk, surfaceAttributesXk);
    var bumpOffset: f32; var isBackFacing: bool;
    let normalsXk = getNormalsAtPoint(
      materialDataXk, &visibilityRay, surfaceAttributesXk, triangle, &bumpOffset, &isBackFacing,
    );

    var woXk = -w_km1;
    var wiXk = pi.reconnectionDirection;
    transformToLocalSpace(&woXk, &wiXk, surfaceAttributesXk, normalsXk);

    let brdfXk = evaluateBrdf(
      materialDataXk, woXk, wiXk, surfaceAttributesXk, normalsXk
    );
    let brdfPdfXk = evaluateLobePdf(
      materialDataXk, woXk, wiXk, surfaceAttributesXk, normalsXk
    );
    var mi = 1.0; // no mis weights since this part of the path is brdf-only
    p *= brdfPdfXk * probability_of_sampling_lobe;

    if (p <= 0.0) {
      // shift failed, should terminate
      // shift failed, should terminate
      // shift failed, should terminate
      // shift failed, should terminate
      rrStepResult.valid = 0;
      rrStepResult.shouldTerminate = true;
      return rrStepResult;
    }

    // absorption check for dielectrics
    if (materialDataXk[0] == ${MATERIAL_TYPE.DIELECTRIC}) {
      var isInsideMedium = dot(normalsXk.shading, w_km1) > 0;
      if (isInsideMedium) {
        let t = length(w_vec);
        let absorption = vec3f(
          exp(-materialDataXk[1] * t), 
          exp(-materialDataXk[2] * t), 
          exp(-materialDataXk[3] * t), 
        );
        *throughput *= absorption;
      }
    }

    var jacobian = vec2f(
      p, 
      abs(dot(w_km1, triangle.geometricNormal)) / dot(w_vec, w_vec)
    );
  
    let pHat = pi.reconnectionRadiance * (1.0 / p) * *throughput * 
               brdf * brdfXk * cosTerm(normals.shading, w_km1, materialData[0]) * 
               cosTerm(normalsXk.shading, pi.reconnectionDirection, materialDataXk[0]);

    rrStepResult.valid = 1;
    rrStepResult.shouldTerminate = true;
    rrStepResult.jacobian = jacobian;
    rrStepResult.pHat = pHat * mi;
    return rrStepResult;
  }

  return rrStepResult;
}
`;
