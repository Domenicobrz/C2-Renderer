import { MATERIAL_TYPE } from '$lib/materials/material';
import { pathConstruction } from './pathConstruction';
import { rrPathConstruction } from './rrPathConstruction';
import { tempDielectric } from './tempDielectric';
import { tempDiffuse2 } from './tempDiffuse2';
import { tempEmissive2 } from './tempEmissive2';
import { tempTorranceSparrow } from './tempTorranceSparrow';

export const tempShadCopy = /*wgsl*/ `
struct SurfaceDescriptor {
  triangleIndex: i32,
  barycentrics: vec2f,
};

struct BrdfDirectionSample {
  brdf: vec3f,
  pdf: f32, 
  mis: f32,
  dir: vec3f,
}

struct LightDirectionSample {
  brdf: vec3f,
  pdf: f32, 
  mis: f32,
  dir: vec3f,
  ls: LightSample,
}

${tempDiffuse2}
${tempEmissive2}
${tempTorranceSparrow}
${tempDielectric}
${pathConstruction}
${rrPathConstruction}

fn evaluateLobePdf(
  material: EvaluatedMaterial, 
  wo: vec3f,
  wi: vec3f,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> f32 {
  let materialType = material.materialType;

  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    return evaluatePdfDiffuseLobe(wi, surfaceNormals);
  }

  if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
    return evaluatePdfEmissiveLobe();
  }

  if (materialType == ${MATERIAL_TYPE.TORRANCE_SPARROW}) {
    return evaluatePdfTSLobe(wo, wi, material);
  }

  if (materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
    return evaluatePdfDielectricLobe(wo, wi, material);
  }

  return 0.0;
}

fn evaluateBrdf(
  material: EvaluatedMaterial, 
  wo: vec3f,
  wi: vec3f,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> vec3f {
  let materialType = material.materialType;

  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    return evaluateDiffuseBrdf(material, surfaceAttributes);
  }

  if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
    return evaluateEmissiveBrdf();
  }

  if (materialType == ${MATERIAL_TYPE.TORRANCE_SPARROW}) {
    return evaluateTSBrdf(wo, wi, material);
  }

  if (materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
    return evaluateDielectricBrdf(wo, wi, material);
  }

  return vec3f(0);
}

fn sampleBrdf(
  material: EvaluatedMaterial, 
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> BrdfDirectionSample {
  let materialType = material.materialType;

  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    return sampleDiffuseBrdf(material, ray, surfaceAttributes, surfaceNormals);
  }

  if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
    return sampleEmissiveBrdf(material, ray, surfaceAttributes, surfaceNormals);
  }

  if (materialType == ${MATERIAL_TYPE.TORRANCE_SPARROW}) {
    return sampleTSBrdf(material, ray, surfaceAttributes, surfaceNormals);
  }

  if (materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
    return sampleDielectricBrdf(material, ray, surfaceAttributes, surfaceNormals);
  }

  return BrdfDirectionSample(vec3f(0), 0, 0, vec3f(0));
}

fn sampleLight(
  material: EvaluatedMaterial, 
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> LightDirectionSample {
  let materialType = material.materialType;

  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    return sampleDiffuseLight(material, ray, surfaceAttributes, surfaceNormals);
  }

  if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
    return sampleEmissiveLight(material, ray, surfaceAttributes, surfaceNormals);
  }

  if (materialType == ${MATERIAL_TYPE.TORRANCE_SPARROW}) {
    return sampleTSLight(material, ray, surfaceAttributes, surfaceNormals);
  }

  if (materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
    return sampleDielectricLight(material, ray, surfaceAttributes, surfaceNormals);
  }

  return LightDirectionSample(vec3f(0), 0, 0, vec3f(0), LightSample());
}

fn evaluateMaterialAtSurfacePoint(
  surface: SurfaceDescriptor,
  surfaceAttributes: SurfaceAttributes
) -> EvaluatedMaterial {
  let materialOffset = triangles[surface.triangleIndex].materialOffset;
  let materialType = u32(materialsBuffer[materialOffset]);

  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    return getDiffuseMaterial(surfaceAttributes, materialOffset);
  }

  if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
    return getEmissiveMaterial(materialOffset);
  }

  if (materialType == ${MATERIAL_TYPE.TORRANCE_SPARROW}) {
    return getTSMaterial(surfaceAttributes, materialOffset);
  }

  if (materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
    return getDielectricMaterial(surfaceAttributes, materialOffset);
  }

  // undefined material, magenta color
  var errorMat = EvaluatedMaterial();
  errorMat.baseColor = vec3f(1.0, 0.0, 1.0);
  errorMat.materialType = ${MATERIAL_TYPE.EMISSIVE};
  errorMat.emissiveIntensity = 1.0;
  errorMat.mapLocation = vec2i(-1, -1);
  errorMat.bumpMapLocation = vec2i(-1, -1);
  errorMat.roughnessMapLocation = vec2i(-1, -1);
  return errorMat;
}

fn getEmissive(material: EvaluatedMaterial, isBackFacing: bool) -> vec3f {
  let materialType = material.materialType;
  if (materialType == ${MATERIAL_TYPE.EMISSIVE} && !isBackFacing) {
    return material.baseColor * material.emissiveIntensity;
  }
  return vec3f(0);
}

fn getNormalsAtPoint(
  material: EvaluatedMaterial,
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  triangle: Triangle,
  bumpOffset: ptr<function, f32>,
  isBackfacing: ptr<function, bool>,
) -> SurfaceNormals {
  *isBackfacing = false;
  let materialType = material.materialType;
  
  let geometricNormal = triangle.geometricNormal;
  var vertexNormal = surfaceAttributes.normal;
  // the normal flip is calculated using the geometric normal to avoid
  // black edges on meshes displaying strong smooth-shading via vertex normals
  if (dot(geometricNormal, (*ray).direction) > 0) {
    *isBackfacing = true;

    if (materialType != ${MATERIAL_TYPE.DIELECTRIC}) {
      vertexNormal = -vertexNormal;
    }
  }
  var normals = SurfaceNormals(geometricNormal, vertexNormal, vertexNormal);

  if (
    materialType == ${MATERIAL_TYPE.DIFFUSE} ||
    materialType == ${MATERIAL_TYPE.TORRANCE_SPARROW} 
  ) {
    let bumpMapLocation = material.bumpMapLocation;
    let bumpStrength = material.bumpStrength;
    let uvRepeat = material.uvRepeat;

    if (bumpMapLocation.x > -1) {

      let surfAttrWithFlippedNormal = SurfaceAttributes(vertexNormal, surfaceAttributes.uv, surfaceAttributes.tangent);
      normals.shading = getShadingNormal(
        bumpMapLocation, bumpStrength, uvRepeat, surfAttrWithFlippedNormal, 
        *ray, triangle, bumpOffset
      );
    }
  }

  if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
    *isBackfacing = false;

    var N = geometricNormal;
    if (dot(N, (*ray).direction) > 0) {
      *isBackfacing = true;
      N = -N;
    }

    normals.geometric = N;
    normals.vertex    = N;
    normals.shading   = N;
  }

  return normals;
}

fn cosTerm(norm: vec3f, dir: vec3f, materialType: u32) -> f32 {
  if (materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
    return abs(dot(norm, dir));
  }
  return max(dot(norm, dir), 0.0);
}

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

  let surface = SurfaceDescriptor(ires.triangleIndex, ires.barycentrics); 
  let surfaceAttributes = getSurfaceAttributes(triangle, ires.barycentrics);
  let material = evaluateMaterialAtSurfacePoint(surface, surfaceAttributes);
  let materialType = material.materialType;

  var bumpOffset = 0.0;
  var isBackFacing = false;
  let normals = getNormalsAtPoint(
    material, ray, surfaceAttributes, triangle, &bumpOffset, &isBackFacing,
  );

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
    if (bumpOffset > 0.0) {
      (*ray).origin += normals.vertex * bumpOffset;
    }
  }

  var emissive = getEmissive(material, isBackFacing);

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

  let brdfSample = sampleBrdf(material, ray, surfaceAttributes, normals);
  var lightSample = LightDirectionSample(vec3f(0), 0, 0, vec3f(0), LightSample());
  let pathIsPureRRThatEndsWithLightSampleNow = pathDoesNotReconnect && pathIsLightSampled && u32(debugInfo.bounce + 1) == pi.bounceCount;
  if (
    !isRandomReplay || 
    (isRandomReplay && pathIsPureRRThatEndsWithLightSampleNow)
  ) {
    // the reason why we're guarding NEE with this if statement is explained in the segment/integrators/mis-explanation.png
    if (debugInfo.bounce < config.BOUNCES_COUNT - 1) {
      lightSample = sampleLight(material, ray, surfaceAttributes, normals);
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
          lightSample, brdfSample, ires,  ray, reservoir, throughput, 
          pi, psi, lastBrdfMis, u32(lobeIndex), isRough, materialType, normals.shading, tid
        );
      }
    }

    // if there's emission
    if (dot(emissive, emissive) > 0.0) {
      emissiveSurfacePathConstruction( 
        brdfSample, ires,  ray, reservoir, throughput, 
        pi, psi, lastBrdfMis, u32(lobeIndex), normals.shading, emissive, tid
      );
    }
  }

  if (isRandomReplay) {
    let rrResult = rrPathConstruction(
      lightSample,
      surfaceAttributes,
      normals,
      material,
      ires, 
      ray,
      throughput, 
      isRough,
      pi,
      psi,
      isBackFacing,
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
