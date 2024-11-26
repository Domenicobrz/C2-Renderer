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

export function getReSTIRDLShader(lutManager: LUTManager) {
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

@group(0) @binding(0) var<storage, read_write> radianceOutput: array<vec3f>;
@group(0) @binding(1) var<storage, read_write> samplesCount: array<u32>;
@group(0) @binding(2) var<uniform> canvasSize: vec2u;

// on a separate bind group since camera changes more often than data/canvasSize
@group(1) @binding(0) var<uniform> camera: Camera;
// seems like maximum bindgroup count is 4 so I need to add the camera sample here 
// unfortunately and I can't create a separate bindgroup for it
@group(1) @binding(1) var<uniform> haltonSamples: array<vec4f, RANDOMS_VEC4F_ARRAY_COUNT>;
@group(1) @binding(2) var<uniform> config: Config;

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
  Y: vec3f,
  Wy: f32,
  wSum: f32,
  isNull: bool,
}

fn updateReservoir(reservoir: ptr<function, Reservoir>, Xi: vec3f, wi: f32) {
  (*reservoir).wSum = (*reservoir).wSum + wi;
  let prob = wi / (*reservoir).wSum;

  if (getRand2D().x < prob) {
    (*reservoir).Y = Xi;
    (*reservoir).isNull = false;
  }
} 

fn getLuminance(emission: vec3f) -> f32 {
  return 0.2126 * emission.x + 0.7152 * emission.y + 0.0722 * emission.z;
}

fn getDirectLightEmission(direction: vec3f, ray: ptr<function, Ray>) -> vec3f {
  let ires = bvhIntersect(Ray(ray.origin + direction * 0.001, direction));
  // this condition will never happen  
  if (!ires.hit) {
    return vec3f(0.0);
  }
  let material: Emissive = createEmissive(ires.triangle.materialOffset);
  let sampleRadiance = material.color * material.intensity;
  return sampleRadiance;
}

fn pHat(sampleDirection: vec3f, ray: ptr<function, Ray>, N: vec3f, brdf: f32) -> f32 {
  let sampleRadiance = getDirectLightEmission(sampleDirection, ray);
  return brdf * max(dot(N, sampleDirection), 0.0) * getLuminance(sampleRadiance);
}

// 6 random values used for each candidate, keep that in mind
fn Resample(M: u32, ray: ptr<function, Ray>, N: vec3f, brdf: f32) -> Reservoir {
  var r = Reservoir(vec3f(0.0), 0.0, 0.0, true);
  let mi = 1.0 / f32(M);

  for (var i: u32 = 0; i < M; i++) {
    let rands = vec4f(getRand2D(), getRand2D());
    let lightSample = getLightSample(ray.origin, rands);
    let direction = lightSample.direction;
    let radiance = lightSample.radiance;
    // ****************************************************
    // ****************************************************
    // Our sampling routine "includes" the visibility test
    // pdf will be zero if the ray was obstructed. 
    // We're also repeating the bvh intersection inside pHat unfortunately
    // ****************************************************
    // ****************************************************
    let pdf = lightSample.pdf;
    var wi = 0.0;
    if (pdf > 0.0) {
      wi = mi * pHat(direction, ray, N, brdf) * (1.0 / pdf);
    
      updateReservoir(&r, direction, wi);
    }
  }

  if (!r.isNull) {
    r.Wy = 1 / pHat(r.Y, ray, N, brdf) * r.wSum;
  }

  return r;
}

fn shadeDiffuse(
  ires: BVHIntersectionResult, 
  ray: ptr<function, Ray>,
  reflectance: ptr<function, vec3f>, 
  rad: ptr<function, vec3f>,
  tid: vec3u,
  i: i32
) {
  let hitPoint = ires.hitPoint;
  let material: Diffuse = createDiffuse(ires.triangle.materialOffset);

  var color = material.color;
  if (material.mapLocation.x > -1) {
    color *= getTexelFromTextureArrays(material.mapLocation, ires.uv, material.mapUvRepeat).xyz;
  }

  var vertexNormal = ires.normal;
  // the normal flip is calculated using the geometric normal to avoid
  // black edges on meshes displaying strong smooth-shading via vertex normals
  if (dot(ires.triangle.geometricNormal, (*ray).direction) > 0) {
    vertexNormal = -vertexNormal;
  }
  var N = vertexNormal;
  var bumpOffset: f32 = 0.0;
  if (material.bumpMapLocation.x > -1) {
    N = getShadingNormal(
      material.bumpMapLocation, material.bumpStrength, material.uvRepeat, N, *ray, 
      ires, &bumpOffset
    );
  }

  // needs to be the exact origin, such that getLightSample/getLightPDF can apply a proper offset 
  (*ray).origin = ires.hitPoint;
  // in practice however, only for Dielectrics we need the exact origin, 
  // for Diffuse we can apply the bump offset if necessary
  if (bumpOffset > 0.0) {
    (*ray).origin += vertexNormal * bumpOffset;
  }

  // rands1.w is used for ONE_SAMPLE_MODEL
  // rands1.xy is used for brdf samples
  // rands2.xyz is used for light samples (getLightSample(...) uses .xyz)
  let rands1 = vec4f(getRand2D(), getRand2D());
  let rands2 = vec4f(getRand2D(), getRand2D());

  var brdf = color / PI;
  var colorLessBrdf = 1.0 / PI;

  let reservoir = Resample(30, ray, N, colorLessBrdf);

  if (!reservoir.isNull) {
    let newDirection = reservoir.Y;

    (*ray).origin += newDirection * 0.001;
    (*ray).direction = newDirection;
  
    let lightSampleRadiance = getDirectLightEmission(newDirection, ray);

    // light contribution
    *rad += brdf * lightSampleRadiance * reservoir.Wy * (*reflectance) * max(dot(N, (*ray).direction), 0.0);
    *reflectance *= 0.0;    
  } else {
    *rad += vec3f(0.0);
    *reflectance *= 0.0;    
  }
}

// ***** Things to remember:  (https://webgpureport.org/)
// maxStorageBuffersPerShaderStage = 8
// maxUniformBuffersPerShaderStage = 12 (maxUniformBuffersPerShaderStage)
// maxBindingsPerBindGroup = 1000
// maxSampledTexturesPerShaderStage = 16
// maxTextureDimension3D = 2048

fn shade(
  ires: BVHIntersectionResult, 
  ray: ptr<function, Ray>,
  reflectance: ptr<function, vec3f>, 
  rad: ptr<function, vec3f>,
  tid: vec3u,
  i: i32) 
{
  let materialOffset = ires.triangle.materialOffset;
  let materialType = materialsData[materialOffset];

  if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
    shadeDiffuse(ires, ray, reflectance, rad, tid, i);
  }
}

@compute @workgroup_size(8, 8) fn compute(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let tid = vec3u(gid.x, gid.y, 0);
  if (tid.x >= canvasSize.x || tid.y >= canvasSize.y) { return; }

  let idx = tid.y * canvasSize.x + tid.x;

  debugInfo.tid = tid;
  debugInfo.isSelectedPixel = false;
  if (debugPixelTarget.x == tid.x && debugPixelTarget.y == tid.y) {
    debugInfo.isSelectedPixel = true;
  }
  debugInfo.sample = samplesCount[idx];

  initializeRandoms(tid, debugInfo.sample);

  var rayContribution: f32;
  var ray = getCameraRay(tid, idx, &rayContribution);

  var reflectance = vec3f(1.0);
  var rad = vec3f(0.0);
  // for (var i = 0; i < config.BOUNCES_COUNT; i++) {
  for (var i = 0; i < 1; i++) {
    if (rayContribution == 0.0) { break; }

    debugInfo.bounce = i;

    let ires = bvhIntersect(ray);

    if (ires.hit) {
      shade(ires, &ray, &reflectance, &rad, tid, i);
    } else if (shaderConfig.HAS_ENVMAP) {
      // we bounced off into the envmap
      let envmapRad = getEnvmapRadiance(ray.direction);
      rad += reflectance * envmapRad;
      break;
    }

    if (reflectance.x == 0.0 && reflectance.y == 0.0 && reflectance.z == 0.0) {
      break;
    }
  }

  if (debugInfo.isSelectedPixel) {
    // debugLog(999);
    radianceOutput[idx] += vec3f(100, 0, 100);
  } else {
    radianceOutput[idx] += rad * rayContribution;
  }

  samplesCount[idx] += 1;
}
`;
}
