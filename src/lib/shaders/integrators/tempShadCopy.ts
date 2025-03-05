import { MATERIAL_TYPE } from '$lib/materials/material';
import { pathConstruction } from './pathConstruction';
import { rrPathConstruction } from './rrPathConstruction';
import { tempDiffuse2 } from './tempDiffuse2';
import { tempEmissive2 } from './tempEmissive2';

export const tempShadCopy = /*wgsl*/ `
const MATERIAL_DATA_ELEMENTS = 20;

struct SurfaceDescriptor {
  triangleIndex: i32,
  barycentrics: vec2f,
};

struct SurfaceNormals {
  geometric: vec3f,
  vertex: vec3f,
  shading: vec3f,
}

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
${pathConstruction}
${rrPathConstruction}

fn evaluateLobePdf(
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>, 
  wo: vec3f,
  wi: vec3f,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> f32 {
  let materialType = materialData[0];

  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    return evaluatePdfDiffuseLobe(wi, surfaceNormals);
  }

  if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
    return evaluatePdfEmissiveLobe();
  }

  return 0.0;
}

fn evaluateBrdf(
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>, 
  wo: vec3f,
  wi: vec3f,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> vec3f {
  let materialType = materialData[0];

  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    return evaluateDiffuseBrdf(materialData, surfaceAttributes);
  }

  if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
    return evaluateEmissiveBrdf();
  }

  return vec3f(0);
}

fn sampleBrdf(
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>, 
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> BrdfDirectionSample {
  let materialType = materialData[0];

  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    return sampleDiffuseBrdf(materialData, ray, surfaceAttributes, surfaceNormals);
  }

  if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
    return sampleEmissiveBrdf(materialData, ray, surfaceAttributes, surfaceNormals);
  }

  return BrdfDirectionSample(vec3f(0), 0, 0, vec3f(0));
}

fn sampleLight(
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>, 
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> LightDirectionSample {
  let materialType = materialData[0];

  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    return sampleDiffuseLight(materialData, ray, surfaceAttributes, surfaceNormals);
  }

  if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
    return sampleEmissiveLight(materialData, ray, surfaceAttributes, surfaceNormals);
  }

  return LightDirectionSample(vec3f(0), 0, 0, vec3f(0), LightSample());
}

fn getDiffuseMaterialData(offset: u32) -> array<f32, MATERIAL_DATA_ELEMENTS> {
  var data = array<f32,MATERIAL_DATA_ELEMENTS>();
  
  // material type
  data[0] = materialsData[offset];
  // color
  data[1] = materialsData[offset + 1];
  data[2] = materialsData[offset + 2];
  data[3] = materialsData[offset + 3];
  // bumpStrength
  data[4] = materialsData[offset + 4];
  // uv repeat x,y
  data[5] = materialsData[offset + 5];
  data[6] = materialsData[offset + 6];
  // map-uv repeat x,y
  data[7] = materialsData[offset + 7];
  data[8] = materialsData[offset + 8];
  // mapLocation    requires bitcast<i32>(...);
  data[9] = materialsData[offset + 9]; // bitcast<i32>(materialsData[offset + 9]),
  data[10] = materialsData[offset + 10]; // bitcast<i32>(materialsData[offset + 10]),
  // bumpMapLocation    requires bitcast<i32>(...);
  data[11] = materialsData[offset + 11];
  data[12] = materialsData[offset + 12];

  return data;
}

fn getEmissiveMaterialData(offset: u32) -> array<f32, MATERIAL_DATA_ELEMENTS> {
  var data = array<f32,MATERIAL_DATA_ELEMENTS>();
  
  // material type
  data[0] = materialsData[offset];
  // color
  data[1] = materialsData[offset + 1];
  data[2] = materialsData[offset + 2];
  data[3] = materialsData[offset + 3];
  // intensity
  data[4] = materialsData[offset + 4];

  return data;
}

fn evaluateMaterialAtSurfacePoint(surface: SurfaceDescriptor) -> array<f32, MATERIAL_DATA_ELEMENTS> {
  let materialOffset = triangles[surface.triangleIndex].materialOffset;
  let materialType = materialsData[materialOffset];

  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    return getDiffuseMaterialData(materialOffset);
  }

  if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
    return getEmissiveMaterialData(materialOffset);
  }

  return array<f32,MATERIAL_DATA_ELEMENTS>();
}

fn getEmissive(materialData: array<f32, MATERIAL_DATA_ELEMENTS>, isBackFacing: bool) -> vec3f {
  let materialType = materialData[0];
  if (materialType == ${MATERIAL_TYPE.EMISSIVE} && !isBackFacing) {
    let color = vec3f(
      materialData[1],
      materialData[2],
      materialData[3],
    );
    let intensity = materialData[4];
    return color * intensity;
  }
  return vec3f(0);
}

fn getNormalsAtPoint(
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>,
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  triangle: Triangle,
  bumpOffset: ptr<function, f32>,
  isBackfacing: ptr<function, bool>,
) -> SurfaceNormals {
  *isBackfacing = false;
  
  let geometricNormal = triangle.geometricNormal;
  var vertexNormal = surfaceAttributes.normal;
  // the normal flip is calculated using the geometric normal to avoid
  // black edges on meshes displaying strong smooth-shading via vertex normals
  if (dot(geometricNormal, (*ray).direction) > 0) {
    *isBackfacing = true;
    vertexNormal = -vertexNormal;
  }
  var normals = SurfaceNormals(geometricNormal, vertexNormal, vertexNormal);

  let materialType = materialData[0];

  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    let bumpMapLocation = vec2i(
      bitcast<i32>(materialData[11]),
      bitcast<i32>(materialData[12]),
    );

    let bumpStrength = materialData[4];
    let uvRepeat = vec2f(materialData[5], materialData[6]);

    if (bumpMapLocation.x > -1) {
      // only used for getShadingNormal. Truth be told, we should change
      // this function's signature but I don't want to deal with that for now
      // TODO: change getShadingNormal such that it's not necessary to
      // create a fake ires struct
      let fakeIres = BVHIntersectionResult(
        false,
        0,
        vec3f(0.0),
        surfaceAttributes.uv,
        surfaceAttributes.normal,
        surfaceAttributes.tangent,
        triangle,
        -1,
        vec2f(0.0),
      );

      normals.shading = getShadingNormal(
        bumpMapLocation, bumpStrength, uvRepeat, vertexNormal, 
        *ray, fakeIres, bumpOffset
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
  let materialData = evaluateMaterialAtSurfacePoint(surface);
  let materialType = materialData[0];

  var bumpOffset = 0.0;
  var isBackFacing = false;
  let normals = getNormalsAtPoint(
    materialData, ray, surfaceAttributes, triangle, &bumpOffset, &isBackFacing,
  );

  var isRough = false;
  var lobeIndex = 0;
  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    isRough = true;
    lobeIndex = 1;
  }
  if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
    isRough = true;
    lobeIndex = 2;
  }

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
  
  var emissive = getEmissive(materialData, isBackFacing);
  // let absorption = getAbsorption(materialData);

  // !!!! careful !!!!
  // !!!! careful !!!!
  // sampleBrdf and sampleLight should *always* use the same number of rands
  // otherwise we can't properly do the RandomReplay

  let brdfSample = sampleBrdf(materialData, ray, surfaceAttributes, normals);

  if (!isRandomReplay) {
    if (debugInfo.bounce == 0) {
      (*reservoir).Gbuffer = vec4f(normals.shading, length((*ray).origin - ires.hitPoint));
    }

    setReconnectionVertex(brdfSample, ires, pi, psi, u32(lobeIndex), tid);

    // the reason why we're guarding NEE with this if statement is explained in the segment/integrators/mis-explanation.png
    if (debugInfo.bounce < config.BOUNCES_COUNT - 1) {
      let lightSample = sampleLight(materialData, ray, surfaceAttributes, normals);
      let lightSampleRadiance = lightSample.ls.radiance;
      let lightSampleSuccessful = dot(lightSampleRadiance, lightSampleRadiance) > 0.0;
      
      if (lightSampleSuccessful) {
        neePathConstruction( 
          lightSample, brdfSample, ires,  ray, reservoir, throughput, 
          pi, psi, lastBrdfMis, u32(lobeIndex), normals.shading, tid
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
    // skip sampleLight(...) randoms...
    if (
      debugInfo.bounce < config.BOUNCES_COUNT - 1 &&
      // ...unless this path is a pure random replay path that is supposed to end with a light sample
      // exactly at this bounce. inside rrPathConstruction we'll create the light sample
      !(pathDoesNotReconnect(*pi) && pathIsLightSampled(*pi) && u32(debugInfo.bounce + 1) == pi.bounceCount)
    ) {
      let rands = vec4f(getRand2D(), getRand2D());
    }

    let rrResult = rrPathConstruction(
      surfaceAttributes,
      normals,
      materialData,
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
  let t = brdfSample.brdf * (/* mis weight */ 1.0 / brdfSample.pdf) * max(dot(normals.shading, brdfSample.dir), 0.0);
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
