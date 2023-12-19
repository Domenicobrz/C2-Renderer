import { Diffuse } from '$lib/materials/diffuse';
import { Material } from '$lib/materials/material';
import { Triangle } from '$lib/primitives/triangle';
import { cameraPart } from './parts/camera';
import { mathUtilsPart } from './parts/mathUtils';

export const computeShader = /* wgsl */ `
// at the moment these have to be imported with this specific order
${mathUtilsPart}
${Diffuse.shaderStruct()}
${Diffuse.shaderCreateStruct()}
${Material.shaderMaterialSelection()}
${cameraPart}
${Triangle.shaderStruct()}
${Triangle.shaderIntersectionFn()}

@group(0) @binding(0) var<storage, read_write> data: array<vec3f>;
@group(0) @binding(1) var<uniform> canvasSize: vec2u;

// on a separate bind group since camera changes more often than data/canvasSize
@group(1) @binding(0) var<uniform> camera: Camera;

@group(2) @binding(0) var<storage, read_write> debugBuffer: array<f32>;
@group(2) @binding(1) var<uniform> debugPixelTarget: vec2<u32>;

@group(3) @binding(0) var<storage> triangles: array<Triangle>;
@group(3) @binding(1) var<storage> materialsData: array<f32>;

const PI = 3.14159265359;

@compute @workgroup_size(8, 8) fn computeSomething(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  if (gid.x >= canvasSize.x || gid.y >= canvasSize.y) { return; }

  // from [0...1] to [-1...+1]
  let nuv = vec2f(
    f32(gid.x) / f32(canvasSize.x) * 2 - 1,
    f32(gid.y) / f32(canvasSize.y) * 2 - 1,
  );

  let aspectRatio = f32(canvasSize.x) / f32(canvasSize.y);
  let fovTangent = tan(camera.fov * 0.5);
  let rd = camera.rotationMatrix * normalize(vec3f(
    fovTangent * nuv.x * aspectRatio, 
    fovTangent * nuv.y, 
    1.0
  ));
  let ro = camera.position;

  let ray = Ray(ro, rd);

  var closestT = 999999999.0;
  var hitTriangle: Triangle;
  let trianglesCount = arrayLength(&triangles);
  for (var i: u32 = 0; i < trianglesCount; i++) {
    let triangle = triangles[i];
    let intersectionResult = intersectTriangle(triangle, ray);
    if (intersectionResult.hit && intersectionResult.t < closestT) {
      closestT = intersectionResult.t;
      hitTriangle = triangle;
    }
  }

  let color = getAlbedo(hitTriangle.materialOffset);
  let finalColor = select(vec3f(0,0,0), color, closestT < 999999999.0);

  let idx = gid.y * canvasSize.x + gid.x;
  // data[idx] = rd;
  data[idx] = finalColor;





  // debug stuff
  if (debugPixelTarget.x == gid.x && debugPixelTarget.y == gid.y) {
    debugBuffer[0] = f32(debugPixelTarget.x);
    debugBuffer[1] = f32(debugPixelTarget.y);
    debugBuffer[2] = 999;
    data[idx] = vec3f(0, 1, 0);
  }
}
`;
