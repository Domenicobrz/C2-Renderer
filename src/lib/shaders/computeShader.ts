import { AABB } from '$lib/bvh/aabb';
import { BVH } from '$lib/bvh/bvh';
import { Diffuse } from '$lib/materials/diffuse';
import { Emissive } from '$lib/materials/emissive';
import { Material } from '$lib/materials/material';
import { Triangle } from '$lib/primitives/triangle';
import { cameraPart } from './parts/camera';
import { mathUtilsPart } from './parts/mathUtils';
import { randomPart } from './parts/random';

export const computeShader = /* wgsl */ `
// at the moment these have to be imported with this specific order
${randomPart}
${mathUtilsPart}
${Emissive.shaderStruct()}
${Emissive.shaderCreateStruct()}
${Diffuse.shaderStruct()}
${Diffuse.shaderCreateStruct()}
${Material.shaderMaterialSelection()}
${cameraPart}
${Triangle.shaderStruct()}
${Triangle.shaderIntersectionFn()}
${AABB.shaderStruct()}
${AABB.shaderIntersect()}
${BVH.shaderStruct()}
${BVH.shaderIntersect()}

@group(0) @binding(0) var<storage, read_write> data: array<vec3f>;
@group(0) @binding(1) var<uniform> canvasSize: vec2u;

// on a separate bind group since camera changes more often than data/canvasSize
@group(1) @binding(0) var<uniform> camera: Camera;
// seems like maximum bindgroup count is 4 so I need to add the camera sample here 
// unfortunately and I can't create a separate bindgroup for it
@group(1) @binding(1) var<uniform> cameraSample: vec2f;

@group(2) @binding(0) var<storage, read_write> debugBuffer: array<f32>;
@group(2) @binding(1) var<uniform> debugPixelTarget: vec2<u32>;

@group(3) @binding(0) var<storage> triangles: array<Triangle>;
@group(3) @binding(1) var<storage> materialsData: array<f32>;
@group(3) @binding(2) var<storage> bvhData: array<BVHNode>;

const PI = 3.14159265359;

@compute @workgroup_size(8, 8) fn computeSomething(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  if (gid.x >= canvasSize.x || gid.y >= canvasSize.y) { return; }

  // from [0...1] to [-1...+1]
  let nuv = vec2f(
    (f32(gid.x) + cameraSample.x) / f32(canvasSize.x) * 2 - 1,
    (f32(gid.y) + cameraSample.y) / f32(canvasSize.y) * 2 - 1,
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

  let idx = gid.y * canvasSize.x + gid.x;

  var mult = vec3f(1.0);
  var rad = vec3f(0.0);
  for (var i = 0; i < 5; i++) {
    let ires = bvhIntersect(ray);

    if (ires.hit) {
      let hitPoint = ires.hitPoint;
      let color = getAlbedo(ires.triangle.materialOffset);
      let emissive = getEmissive(ires.triangle.materialOffset);

      var N = ires.triangle.normal;
      if (dot(N, ray.direction) > 0) {
        N = -N;
      }

      rad += emissive * mult;
      mult *= color * max(dot(N, -ray.direction), 0.0) * (1 / PI) * (2 * PI);

      ray.origin = ires.hitPoint - ray.direction * 0.001;

      let rands = rand4(
        gid.y * canvasSize.x + gid.x +
        u32(cameraSample.x * 928373289 + cameraSample.y * 877973289) +
        u32(i * 17325799),
      );

      let r0 = 2.0 * PI * rands.x;
      let r1 = acos(rands.y);
      let nd = normalize(vec3f(
        sin(r0) * sin(r1),
        cos(r1),
        cos(r0) * sin(r1),
      ));

      var Nt = vec3f(0,0,0);
      var Nb = vec3f(0,0,0);
      getCoordinateSystem(N, &Nt, &Nb);

      ray.direction = normalize(Nt * nd.x + N * nd.y + Nb * nd.z);
    } else {
      break;
    }
  }
  data[idx] += rad;

  if (debugPixelTarget.x == gid.x && debugPixelTarget.y == gid.y) {
    debugBuffer[0] = f32(debugPixelTarget.x);
    debugBuffer[1] = f32(debugPixelTarget.y);
    debugBuffer[2] = 999;
    debugBuffer[3] = 999;
    debugBuffer[4] = 999;
    data[idx] += vec3f(0, 1, 0);
  }
}
`;
