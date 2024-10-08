export const resetShader = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> radianceOutput: array<vec3f>;
@group(0) @binding(1) var<storage, read_write> samplesCount: array<u32>;
@group(0) @binding(2) var<uniform> canvasSize: vec2u;

@compute @workgroup_size(8, 8) fn resetCanvas(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  if (gid.x >= canvasSize.x || gid.y >= canvasSize.y) { return; }

  let idx = gid.y * canvasSize.x + gid.x;
  radianceOutput[idx] = vec3f(0,0,0);
  samplesCount[idx] = 0;
}
`;
