export const computeShader = /*wgsl*/`
@group(0) @binding(0) var<storage, read_write> data: array<vec3f>;

@compute @workgroup_size(8, 8) fn computeSomething(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let idx = lid.y * 8 + lid.x;
  data[idx] = vec3f(
    sin(f32(lid.x) * 0.75) * 0.5 + 0.5, 
    cos(f32(lid.y) * 0.75) * 0.5 + 0.5, 
    0
  );
}
`;