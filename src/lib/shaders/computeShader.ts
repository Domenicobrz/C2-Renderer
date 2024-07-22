import { AABB } from '$lib/bvh/aabb';
import { BVH } from '$lib/bvh/bvh';
import { configManager } from '$lib/config';
import { Diffuse } from '$lib/materials/diffuse';
import { Emissive } from '$lib/materials/emissive';
import { TorranceSparrow } from '$lib/materials/torranceSparrow';
import { Material } from '$lib/materials/material';
import { Triangle } from '$lib/primitives/triangle';
import { TileSequence } from '$lib/tile';
import { cameraPart } from './parts/camera';
import { mathUtilsPart } from './parts/mathUtils';
import { pbrtMathUtilsPart } from './parts/pbrtMathUtils';
import { randomPart } from './parts/random';
import { CookTorrance } from '$lib/materials/cookTorrance';
import { Dielectric } from '$lib/materials/dielectric';
import { PC2D } from '$lib/samplers/PiecewiseConstant2D';
import { PC1D } from '$lib/samplers/PiecewiseConstant1D';
import { Envmap } from '$lib/envmap/envmap';

export function getComputeShader() {
  return /* wgsl */ `
// keep in mind that configManager.shaderPart() might return different shader code if the
// internal shader configs have changed
${configManager.shaderPart()}
// at the moment these have to be imported with this specific order
${randomPart}
${mathUtilsPart}
${pbrtMathUtilsPart}
${TileSequence.shaderPart()}
${Emissive.shaderStruct()}
${Emissive.shaderCreateStruct()}
${Emissive.shaderShadeEmissive()}
${Diffuse.shaderStruct()}
${Diffuse.shaderCreateStruct()}
${Diffuse.shaderShadeDiffuse()}
${TorranceSparrow.shaderStruct()}
${TorranceSparrow.shaderCreateStruct()}
${TorranceSparrow.shaderShadeTorranceSparrow()}
${CookTorrance.shaderStruct()}
${CookTorrance.shaderCreateStruct()}
${CookTorrance.shaderShadeCookTorrance()}
${Dielectric.shaderStruct()}
${Dielectric.shaderCreateStruct()}
${Dielectric.shaderShadeDielectric()}
${Material.shaderShade()}
${cameraPart}
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

@group(0) @binding(0) var<storage, read_write> radianceOutput: array<vec3f>;
@group(0) @binding(1) var<storage, read_write> samplesCount: array<u32>;
@group(0) @binding(2) var<uniform> canvasSize: vec2u;

// on a separate bind group since camera changes more often than data/canvasSize
@group(1) @binding(0) var<uniform> camera: Camera;
// seems like maximum bindgroup count is 4 so I need to add the camera sample here 
// unfortunately and I can't create a separate bindgroup for it
@group(1) @binding(1) var<uniform> cameraSample: vec2f;
@group(1) @binding(2) var<uniform> config: Config;
@group(1) @binding(3) var<uniform> tile: Tile;

@group(2) @binding(0) var<storage, read_write> debugBuffer: array<f32>;
@group(2) @binding(1) var<uniform> debugPixelTarget: vec2<u32>;

@group(3) @binding(0) var<storage> triangles: array<Triangle>;
@group(3) @binding(1) var<storage> materialsData: array<f32>;
@group(3) @binding(2) var<storage> bvhData: array<BVHNode>;
@group(3) @binding(3) var<storage> lightsCDFData: array<LightCDFEntry>;
@group(3) @binding(4) var<storage> envmapPC2D: PC2D;
@group(3) @binding(5) var envmapTexture: texture_2d<f32>;
@group(3) @binding(6) var<uniform> envmapInfo: EnvmapInfo;

// things to remember: maximum storage entries on my GPU is 8
// I might need to re-architect this shader to pack togheter some types of data

@compute @workgroup_size(8, 8) fn computeSomething(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let tid = vec3u(tile.x + gid.x, tile.y + gid.y, 0);
  if (tid.x >= canvasSize.x || tid.y >= canvasSize.y) { return; }

  // from [0...1] to [-1...+1]
  let nuv = vec2f(
    (f32(tid.x) + cameraSample.x) / f32(canvasSize.x) * 2 - 1,
    (f32(tid.y) + cameraSample.y) / f32(canvasSize.y) * 2 - 1,
  );

  let aspectRatio = f32(canvasSize.x) / f32(canvasSize.y);
  let fovTangent = tan(camera.fov * 0.5);
  let rd = camera.rotationMatrix * normalize(vec3f(
    fovTangent * nuv.x * aspectRatio, 
    fovTangent * nuv.y, 
    1.0
  ));
  let ro = camera.position;
  var ray = Ray(ro, rd);

  let idx = tid.y * canvasSize.x + tid.x;

  var reflectance = vec3f(1.0);
  var rad = vec3f(0.0);
  for (var i = 0; i < 10; i++) {
    let ires = bvhIntersect(ray);

    if (ires.hit) {
      shade(ires, &ray, &reflectance, &rad, tid, i);
    } else if (shaderConfig.HAS_ENVMAP) {
      // we bounced off into the envmap
      let envmapRad = getEnvmapRadiance(ray.direction);
      rad += reflectance * envmapRad;
      break;
    }
  }
  radianceOutput[idx] += rad;
  samplesCount[idx] += 1;

  if (debugPixelTarget.x == tid.x && debugPixelTarget.y == tid.y) {
    debugBuffer[0] = f32(debugPixelTarget.x);
    debugBuffer[1] = f32(debugPixelTarget.y);
    debugBuffer[2] = 999;
    debugBuffer[3] = 999;
    debugBuffer[4] = 999;
    radianceOutput[idx] += vec3f(0, 1, 0);
  }
}
`;
}
