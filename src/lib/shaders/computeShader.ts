import { cameraPart } from './parts/camera';
import { mathUtilsPart } from './parts/mathUtils';
import { primitivesPart } from './parts/primitives';

export const computeShader = /* wgsl */ `
// at the moment these have to be imported with this specific order
${mathUtilsPart}
${cameraPart}
${primitivesPart}

@group(0) @binding(0) var<storage, read_write> data: array<vec3f>;
@group(0) @binding(1) var<uniform> canvasSize: vec2u;

// on a separate bind group since camera changes more often than data/canvasSize
@group(1) @binding(0) var<uniform> camera: Camera;

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
  // let sphere = Sphere(vec3f(0, 0, 10), 1);
  // let intersectionResult = intersectSphere(sphere, ray);
  let triangle = Triangle(vec3f(-1, 0, 0), vec3f(0, 1.5, 0), vec3f(1, 0, 0));
  let intersectionResult = intersectTriangle(triangle, ray);

  let finalColor = select(vec3f(0,0,0), vec3f(1,0,0), intersectionResult.hit);


  let idx = gid.y * canvasSize.x + gid.x;
  // data[idx] = rd;
  data[idx] = finalColor;
}
`;
