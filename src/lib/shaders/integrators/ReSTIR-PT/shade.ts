import { MATERIAL_TYPE } from '$lib/materials/material';

export const shade = /* wgsl */ `
fn shade(
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
  let triangle = triangles[ires.triangleIndex];

  var material = EvaluatedMaterial();
  var geometryContext = GeometryContext();
  evaluateMaterialAndGeometryContext(ires, *ray, &material, &geometryContext, false);

  let materialType = material.materialType;
  var isRough = false;
  var lobeIndex = i32(materialType);
  
  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    isRough = true;
  }
  if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
    isRough = true;
  }  
  if (
    materialType == ${MATERIAL_TYPE.TORRANCE_SPARROW} ||
    materialType == ${MATERIAL_TYPE.DIELECTRIC} 
  ) {
    let ax = material.ax;
    let ay = material.ay;
    isRough = min(ax, ay) > 0.15;
  }

  let normals = geometryContext.normals;
  let gBufferDepth = length((*ray).origin - ires.hitPoint);

  // TODO:
  // v v v v v  this whole thing stinks and I don't understand it anymore, refactor it v v v v v
  // v v v v v  this whole thing stinks and I don't understand it anymore, refactor it v v v v v
  // v v v v v  this whole thing stinks and I don't understand it anymore, refactor it v v v v v
  // needs to be the exact origin, such that getLightSample/getLightPDF can apply a proper offset 
  (*ray).origin = ires.hitPoint;
  // in practice however, only for Dielectrics we need the exact origin, 
  // for TorranceSparrow/Diffuse we can apply the bump offset if necessary
  if (materialType != ${MATERIAL_TYPE.DIELECTRIC}) {
    if (geometryContext.bumpOffset > 0.0) {
      (*ray).origin += normals.vertex * geometryContext.bumpOffset;
    }
  }
  geometryContext.ray = *ray;


  var emissive = getEmissive(material, geometryContext.isBackFacing);

  // absorption check for dielectrics
  if (materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
    var isInsideMedium = dot(normals.shading, (*ray).direction) > 0;
        
    // beer-lambert absorption 
    if (isInsideMedium) {
      let absorption = vec3f(
        exp(-material.absorptionCoefficient.x * ires.t), 
        exp(-material.absorptionCoefficient.y * ires.t), 
        exp(-material.absorptionCoefficient.z * ires.t), 
      );

      *throughput *= absorption;
      // already found reconnection vertex previously
      if ((*psi).reconnectionVertexIndex != -1 && (*psi).reconnectionVertexIndex < debugInfo.bounce) {
        // brdf-ray post fix throughput
        psi.postfixThroughput *= absorption;
      }
    }
  }

  let unpackedFlags = unpackPathFlags((*pi).flags);
  let pathDoesNotReconnect = !unpackedFlags.reconnects;
  let pathIsLightSampled = unpackedFlags.lightSampled;

  // !!!! careful !!!!
  // !!!! careful !!!!
  // With the existing architecture, sampleLight should *always* use the same number of rands for every material, 
  // otherwise we can't properly replay the path. 
  // This restriction doesn't apply to sampleBrdf since we're never skipping those randoms.
  // A longer and clearer explanation is in: segment/integrators/randoms.md

  let brdfSample = sampleBrdf(material, geometryContext);
  var lightSample = LightDirectionSample(vec3f(0), 0, 0, vec3f(0), LightSample());
  let pathIsPureRRThatEndsWithLightSampleNow = pathDoesNotReconnect && pathIsLightSampled && u32(debugInfo.bounce + 1) == pi.bounceCount;
  if (
    !isRandomReplay || 
    (isRandomReplay && pathIsPureRRThatEndsWithLightSampleNow)
  ) {
    // the reason why we're guarding NEE with this if statement is explained in the segment/integrators/mis-explanation.png
    if (debugInfo.bounce < config.BOUNCES_COUNT - 1) {
      lightSample = sampleLight(material, geometryContext);
    }
  } else if (isRandomReplay && !pathIsPureRRThatEndsWithLightSampleNow) {
    // skip sampleLight(...) randoms
    // unless this path is a pure random replay path that is supposed to end with a light sample
    // exactly at this bounce. in that case we'll create the light sample above and we don't have to
    // skip randoms
    if (debugInfo.bounce < config.BOUNCES_COUNT - 1) {
      let rands = vec4f(getRand2D(), getRand2D());
    }
  }

  if (!isRandomReplay) {
    if (debugInfo.bounce == 0) {
      (*reservoir).Gbuffer = vec4f(normals.shading, gBufferDepth);
    }

    setReconnectionVertex(brdfSample, ires, pi, psi, u32(lobeIndex), isRough, tid);

    if (debugInfo.bounce < config.BOUNCES_COUNT - 1) {
      let lightSampleRadiance = lightSample.ls.radiance;
      let lightSampleSuccessful = dot(lightSampleRadiance, lightSampleRadiance) > 0.0;
      
      if (lightSampleSuccessful) {
        neePathConstruction( 
          lightSample, brdfSample, ires, reservoir, throughput, 
          pi, psi, lastBrdfMis, u32(lobeIndex), isRough, materialType, normals.shading, tid
        );
      }
    }

    // if there's emission
    if (dot(emissive, emissive) > 0.0) {
      emissiveSurfacePathConstruction( 
        brdfSample, ires, reservoir, throughput, 
        pi, psi, lastBrdfMis, u32(lobeIndex), normals.shading, emissive, tid
      );
    }
  }

  if (isRandomReplay) {
    let rrResult = rrPathConstruction(
      lightSample,
      geometryContext,
      material,
      ires, 
      throughput, 
      isRough,
      pi,
      psi,
      emissive,
      lastBrdfMis,
      u32(lobeIndex),
    );
    if (rrResult.shouldTerminate || rrResult.valid > 0) {
      return rrResult;
    }
  }

  // now you have to actually change ray.direction to reflect the new direction
  (*ray).origin += brdfSample.dir * 0.001;
  (*ray).direction = brdfSample.dir;

  *lastBrdfMis = brdfSample.mis;
  var t = brdfSample.brdf * (/* mis weight */ 1.0 / brdfSample.pdf);
  t *= cosTerm(normals.shading, brdfSample.dir, materialType);

  *throughput *= t;

  // already found reconnection vertex previously
  if (
    (*psi).reconnectionVertexIndex != -1 && 
    (*psi).reconnectionVertexIndex < debugInfo.bounce
  ) {
    // brdf-ray post fix throughput
    psi.postfixThroughput *= t;
  }
  
  psi.wasPrevVertexRough = isRough;
  psi.prevLobeIndex      = lobeIndex;
  psi.prevVertexPosition = ires.hitPoint;
  psi.prevVertexBrdf     = brdfSample.brdf;
  psi.brdfPdfPrevVertex  = brdfSample.pdf;
  psi.lobePdfPrevVertex  = 1.0;

  return RandomReplayResult(0, vec3f(0.0), false, vec2f(0.0));
}
`;
