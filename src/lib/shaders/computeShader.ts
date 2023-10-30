export const computeShader = /*wgsl*/`
@group(0) @binding(0) var<storage, read_write> data: array<vec3f>;
@group(0) @binding(1) var<uniform> canvasSize: vec2u;

@compute @workgroup_size(8, 8) fn computeSomething(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  if (gid.x >= canvasSize.x || gid.y >= canvasSize.y) { return; }

  let idx = gid.y * canvasSize.x + gid.x;
  data[idx] = vec3f(
    sin(f32(gid.x) * 0.75) * 0.5 + 0.5, 
    cos(f32(gid.y) * 0.75) * 0.5 + 0.5, 
    0
  );
}
`;