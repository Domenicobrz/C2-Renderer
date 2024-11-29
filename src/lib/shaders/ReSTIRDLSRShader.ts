import { AABB } from '$lib/bvh/aabb';
import { BVH } from '$lib/bvh/bvh';
import { configManager } from '$lib/config';
import { Diffuse } from '$lib/materials/diffuse';
import { Emissive } from '$lib/materials/emissive';
import { TorranceSparrow } from '$lib/materials/torranceSparrow';
import { Material, MATERIAL_TYPE } from '$lib/materials/material';
import { Triangle } from '$lib/primitives/triangle';
import { mathUtilsPart } from './parts/mathUtils';
import { pbrtMathUtilsPart } from './parts/pbrtMathUtils';
import { randomPart } from './parts/random';
import { Dielectric } from '$lib/materials/dielectric';
import { PC2D } from '$lib/samplers/PiecewiseConstant2D';
import { PC1D } from '$lib/samplers/PiecewiseConstant1D';
import { Envmap } from '$lib/envmap/envmap';
import { Camera } from '$lib/controls/Camera';
import { Plane } from '$lib/primitives/plane';
import { misPart } from './parts/mis';
import { texturePart } from './parts/texture';
import { shadingNormalsPart } from './parts/shadingNormal';
import type { LUTManager } from '$lib/managers/lutManager';
import { getRandomPart } from './parts/getRandom';
import { EONDiffuse } from '$lib/materials/EONDiffuse';

export function getReSTIRDLSRShader(lutManager: LUTManager) {
  return /* wgsl */ `
// keep in mind that configManager.shaderPart() might return different shader code if the
// internal shader configs have changed
${configManager.shaderPart()}
// at the moment these have to be imported with this specific order
${randomPart}
${mathUtilsPart}
${pbrtMathUtilsPart}
${misPart}
${texturePart}
${shadingNormalsPart}
${getRandomPart}
${lutManager.getShaderPart()}
${Emissive.shaderStruct()}
${Emissive.shaderCreateStruct()}
${Emissive.shaderShadeEmissive()}
${Diffuse.shaderStruct()}
${Diffuse.shaderCreateStruct()}
${'' /* Diffuse.shaderShadeDiffuse() */}
${'' /* EONDiffuse.shaderStruct() */}
${'' /* EONDiffuse.shaderCreateStruct() */}
${'' /* EONDiffuse.shaderShadeEONDiffuse() */}
${'' /* TorranceSparrow.shaderStruct() */}
${'' /* TorranceSparrow.shaderCreateStruct() */}
${'' /* TorranceSparrow.shaderBRDF() */}
${'' /* TorranceSparrow.shaderShadeTorranceSparrow() */}
${'' /* Dielectric.shaderStruct() */}
${'' /* Dielectric.shaderCreateStruct() */}
${'' /* Dielectric.shaderBRDF() */}
${'' /* Dielectric.shaderShadeDielectric() */}
${'' /* Material.shaderShade() */}
${Camera.shaderStruct()}
${Camera.shaderMethods()}
${Triangle.shaderStruct()}
${Triangle.shaderIntersectionFn()}
${AABB.shaderStruct()}
${AABB.shaderIntersect()}
${BVH.shaderStruct()}
${BVH.shaderIntersect()}
${PC1D.shaderStruct()}
${PC1D.shaderMethods()}
${PC2D.shaderStruct()}
${PC2D.shaderMethods()}
${Envmap.shaderStruct()}
${Envmap.shaderMethods()}
${Plane.shaderMethods()}

@group(0) @binding(0) var<storage, read_write> restirPassInput: array<ReSTIRPassData>;
@group(0) @binding(1) var<storage, read_write> radianceOutput: array<vec3f>;
@group(0) @binding(2) var<uniform> canvasSize: vec2u;

// on a separate bind group since camera changes more often than data/canvasSize
@group(1) @binding(0) var<uniform> camera: Camera;
// seems like maximum bindgroup count is 4 so I need to add the camera sample here 
// unfortunately and I can't create a separate bindgroup for it
@group(1) @binding(1) var<uniform> haltonSamples: array<vec4f, RANDOMS_VEC4F_ARRAY_COUNT>;
@group(1) @binding(2) var<uniform> config: Config;
@group(1) @binding(3) var<uniform> finalPass: u32; // 1 if true, 0 otherwise

@group(2) @binding(0) var<storage, read_write> debugBuffer: array<f32>;
@group(2) @binding(1) var<uniform> debugPixelTarget: vec2<u32>;

@group(3) @binding(0) var<storage> triangles: array<Triangle>;
@group(3) @binding(1) var<storage> materialsData: array<f32>;
@group(3) @binding(2) var<storage> bvhData: array<BVHNode>;
@group(3) @binding(3) var<storage> lightsCDFData: array<LightCDFEntry>;
// envmapPC2Darray will contain:
// pConditionalV: PC1D[];
// pMarginal: PC1D;
// - - - - - - - -  
// PC1D will be held in memory with this layout:
// min, max, funcInt, func[], absFunc[], cdf[]
@group(3) @binding(4) var<storage> envmapPC2Darray: array<f32>;
@group(3) @binding(5) var<uniform> envmapPC2D: PC2D;
@group(3) @binding(6) var envmapTexture: texture_2d<f32>;
@group(3) @binding(7) var<uniform> envmapInfo: EnvmapInfo;
@group(3) @binding(8) var textures128: texture_2d_array<f32>;
@group(3) @binding(9) var textures512: texture_2d_array<f32>;
@group(3) @binding(10) var textures1024: texture_2d_array<f32>;
// learn opengl uses 128x128 on their own implementation for DGF
// adobe photoshop can export and use LUTs of 32 and 64
// I decided to use up to two slots: lut32 and lut64
// for LUTs that are single-layer and higher than 64, we can use the texture_2d_arrays above
@group(3) @binding(11) var lut32: texture_3d<f32>;
@group(3) @binding(12) var blueNoise256: texture_2d<f32>;

struct DebugInfo {
  tid: vec3u,
  isSelectedPixel: bool,
  bounce: i32,
  sample: u32,
  debugLogIndex: u32,
} 
// https://www.w3.org/TR/WGSL/#address-spaces-private
var<private> debugInfo = DebugInfo(vec3u(0,0,0), false, 0, 0, 0);
fn debugLog(value: f32) {
  debugBuffer[debugInfo.debugLogIndex] = value;
  debugInfo.debugLogIndex++;
}

struct Reservoir {
  Y: vec3f,  // x2, light sample hit point
  Y1: i32,   // light sample triangle index
  Wy: f32,
  wSum: f32,
  isNull: f32,
}

struct ReSTIRPassData {
  hit: f32,
  x0: vec3f,
  x1: vec3f,
  normal: vec3f,
  x1TriangleIndex: i32,  // (necessary for material data)
  r: Reservoir,          // (contains x2 and x2TriangleIndex)
}

fn updateReservoir(reservoir: ptr<function, Reservoir>, Xi: vec3f, Xi1: i32, wi: f32) {
  (*reservoir).wSum = (*reservoir).wSum + wi;
  let prob = wi / (*reservoir).wSum;
  let rand = getRand2D().x;

  if (rand < prob) {
    (*reservoir).Y = Xi;
    (*reservoir).Y1 = Xi1;
    (*reservoir).isNull = -1.0;
  }
} 

fn getLuminance(emission: vec3f) -> f32 {
  return 0.2126 * emission.x + 0.7152 * emission.y + 0.0722 * emission.z;
}

fn getDirectLightEmission(direction: vec3f, origin: vec3f, x2TriangleIndex: i32) -> vec3f {
  let ires = bvhIntersect(Ray(origin + direction * 0.001, direction));
  // this condition will never happen  
  if (!ires.hit) { 
    return vec3f(0.0);
  }
  // however this one CAN happen because we're fixing x2
  // but we're now changing x0 and x1 and that can lead to Visibility being 0 
  // from that particular x1
  if (ires.triangleIndex != x2TriangleIndex) {
    return vec3f(0.0);
  }
  let material: Emissive = createEmissive(ires.triangle.materialOffset);
  let sampleRadiance = material.color * material.intensity;
  return sampleRadiance;
}

fn pHat(x0: vec3f, x1: vec3f, x2: vec3f, x2TriangleIndex: i32, N: vec3f) -> f32 {
  let brdf = 1.0 / PI;
  
  let sampleDirection = normalize(x2 - x1);
  let sampleRadiance = getDirectLightEmission(sampleDirection, x1, x2TriangleIndex);

  let p = brdf * max(dot(N, sampleDirection), 0.0) * getLuminance(sampleRadiance);

  return p;
}

fn generalizedBalanceHeuristic(
  x2: vec3f, x2TriangleIndex: i32, candidates: array<ReSTIRPassData, 5>, index: i32
) -> f32 {
  let M: i32 = 5;

  let xi0 = candidates[index].x0;
  let xi1 = candidates[index].x1;
  let Ni  = candidates[index].normal;
  let pi = pHat(xi0, xi1, x2, x2TriangleIndex, Ni);
  
  var pjSum = 0.0;
  
  for (var i: i32 = 0; i < M; i++) {
    let xj0 = candidates[i].x0;
    let xj1 = candidates[i].x1;
    let Nj  = candidates[i].normal;
    
    let pj = pHat(xj0, xj1, x2, x2TriangleIndex, Nj);
    pjSum += pj;
  }

  return pi / pjSum;
}

fn SpatialResample(candidates: array<ReSTIRPassData, 5>) -> Reservoir {
  // ******* important: first candidate is the current pixel's reservoir ***********
  // ******* I should probably update this function to reflect that ***********
  
  var r = Reservoir(vec3f(0.0), 0, 0.0, 0.0, 1.0);
  let M: i32 = 5;

  let x0 = candidates[0].x0;
  let x1 = candidates[0].x1;
  let N = candidates[0].normal;

  for (var i: i32 = 0; i < M; i++) {
    let Xi = candidates[i].r.Y;
    let Xi1 = candidates[i].r.Y1;
    let Wxi = candidates[i].r.Wy;

    let mi = generalizedBalanceHeuristic(Xi, Xi1, candidates, i);
    let wi = mi * pHat(x0, x1, Xi, Xi1, N) * Wxi;

    if (wi > 0.0) {
      updateReservoir(&r, Xi, Xi1, wi);
    }
  }

  if (r.isNull <= 0.0) {
    r.Wy = 1 / pHat(x0, x1, r.Y, r.Y1, N) * r.wSum;
  }

  return r;
}

fn shadeDiffuse(
  restirData: ptr<function, ReSTIRPassData>,
  rad: ptr<function, vec3f>,
  tid: vec3u,
  i: i32
) {
  let triangle = triangles[restirData.x1TriangleIndex];
  let hitPoint = restirData.x1;
  let material: Diffuse = createDiffuse(triangle.materialOffset);

  var color = material.color;
  // if (material.mapLocation.x > -1) {
  //   color *= getTexelFromTextureArrays(material.mapLocation, ires.uv, material.mapUvRepeat).xyz;
  // }

  // var vertexNormal = ires.normal;
  // // the normal flip is calculated using the geometric normal to avoid
  // // black edges on meshes displaying strong smooth-shading via vertex normals
  // if (dot(ires.triangle.geometricNormal, (*ray).direction) > 0) {
  //   vertexNormal = -vertexNormal;
  // }
  // var N = vertexNormal;
  // var bumpOffset: f32 = 0.0;
  // if (material.bumpMapLocation.x > -1) {
  //   N = getShadingNormal(
  //     material.bumpMapLocation, material.bumpStrength, material.uvRepeat, N, *ray, 
  //     ires, &bumpOffset
  //   );
  // }

  var N = restirData.normal;

  // // needs to be the exact origin, such that getLightSample/getLightPDF can apply a proper offset 
  // (*ray).origin = ires.hitPoint;
  // // in practice however, only for Dielectrics we need the exact origin, 
  // // for Diffuse we can apply the bump offset if necessary
  // if (bumpOffset > 0.0) {
  //   (*ray).origin += vertexNormal * bumpOffset;
  // }

  var brdf = color / PI;

  let r = restirData.r;
  if (r.isNull <= 0.0) {
    let x2 = r.Y;
    let x2TriangleIndex = r.Y1;

    let lightDir = normalize(x2 - hitPoint);

    let lightTriangle = triangles[x2TriangleIndex];
    let material: Emissive = createEmissive(lightTriangle.materialOffset);
    let sampleRadiance = material.color * material.intensity;

    *rad += brdf * sampleRadiance * r.Wy * max(dot(N, lightDir), 0.0);
  }
}

fn shade(
  restirData: ptr<function, ReSTIRPassData>,
  rad: ptr<function, vec3f>,
  tid: vec3u,
  i: i32) 
{
  let triangle = triangles[restirData.x1TriangleIndex];
  let materialOffset = triangle.materialOffset;
  let materialType = materialsData[materialOffset];

  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    shadeDiffuse(restirData, rad, tid, i);
  }
}

@compute @workgroup_size(8, 8) fn compute(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  // **************** WARNING *****************
  // **************** WARNING *****************
  // **************** WARNING *****************
  // without being able to use return; here, since we need uniformity 
  // to use a storageBarrier(), we have to make sure that our tiles
  // do not exceed the boundaries too much otherwise there can potentially
  // be a gigantic amount of computation that is wasteful and that needs to 
  // happen regardless since lines are executed in lockstep
  var isOutOfScreenBounds = false;
  let tid = vec3u(gid.x, gid.y, 0);
  
  if (tid.x >= canvasSize.x || tid.y >= canvasSize.y) { 
    isOutOfScreenBounds = true;
  }

  let idx = tid.y * canvasSize.x + tid.x;

  debugInfo.tid = tid;
  debugInfo.isSelectedPixel = false;
  if (debugPixelTarget.x == tid.x && debugPixelTarget.y == tid.y) {
    debugInfo.isSelectedPixel = true;
  }

  var rad = vec3f(0.0);
  var restirData = ReSTIRPassData(
    -1.0, vec3f(0), vec3f(0), vec3f(0), -1,
    Reservoir(vec3f(0), -1, 0, 0, 1.0)
  );
  
  if (!isOutOfScreenBounds) {
    restirData = restirPassInput[idx];

    initializeRandoms(tid, debugInfo.sample);

    // pick 4 or 5 candidates, their restirPassData, and do the needful
    // then modify restirData's reservoir such that it can be used on the shading routine
    // actually the shading routine should not receive restirpass data, it's better if we 
    // do something else once we figured out which sample we want to use
    
    // let's start with a total of 5 candidates
    // ******* important: first candidate is current pixel's reservoir ***********
    var candidates = array<ReSTIRPassData, 5>();
    for (var i = 0; i < 5; i++) {
      if (i == 0) {
        candidates[i] = restirData;
      } else {
        // uniform circle sampling 
        let circleRadiusInPixels = 5.0;
        let rands = getRand2D();
        let r = circleRadiusInPixels * sqrt(rands.x);
        let theta = rands.y * 2.0 * PI;

        let offx = i32(r * cos(theta));
        let offy = i32(r * sin(theta));

        let ntid = vec3i(i32(tid.x) + offx, i32(tid.y) + offy, 0);
        if (ntid.x >= 0 && ntid.y >= 0) {
          let nidx = ntid.y * i32(canvasSize.x) + ntid.x;
          candidates[i] = restirPassInput[nidx];
        } else {
          candidates[i] = ReSTIRPassData(
            -1.0, vec3f(0), vec3f(0), vec3f(0), -1,
            Reservoir(vec3f(0), -1, 0, 0, 1.0)
          );
        }
      }
    }
  
    let r = SpatialResample(candidates);
    restirData.r = r;
  }

  // https://www.w3.org/TR/WGSL/#storageBarrier-builtin
  // https://stackoverflow.com/questions/72035548/what-does-storagebarrier-in-webgpu-actually-do
  // "storageBarrier coordinates access by invocations in single workgroup 
  // to buffers in 'storage' address space."
  storageBarrier();

  // every thread needs to be able to reach the storageBarrier for us to be able to use it,
  // so early returns can only happen afterwards
  if (isOutOfScreenBounds) {
    return;
  }

  restirPassInput[idx] = restirData;

  if (finalPass == 1) {
    shade(&restirData, &rad, tid, 0);

    if (debugInfo.isSelectedPixel) {
      // debugLog(999);
      radianceOutput[idx] += vec3f(1, 0, 0);
    } else {
      radianceOutput[idx] += rad;
    }
  }
}
`;
}
