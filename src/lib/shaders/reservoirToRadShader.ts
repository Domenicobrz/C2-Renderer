import { reservoirShaderPart } from './integrators/reservoir';

export const reservoirToRadShader = /* wgsl */ `
@group(0) @binding(0) var<storage> reservoirBuffer1: array<Reservoir>;
@group(0) @binding(1) var<storage, read_write> reservoirBuffer2: array<Reservoir>;
@group(0) @binding(2) var<storage, read_write> samplesCount: array<u32>;
@group(0) @binding(3) var<storage, read_write> radianceInput: array<vec3f>;
@group(0) @binding(4) var<uniform> canvasSize: vec2u;

${reservoirShaderPart}

@compute @workgroup_size(8, 8) fn compute(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let tid = vec3u(gid.x, gid.y, 0);
  if (tid.x >= canvasSize.x || tid.y >= canvasSize.y) { return; }

  let idx = tid.y * canvasSize.x + tid.x;

  let reservoir = reservoirBuffer1[idx];
  // copy the content to the other reservoir buffer, so they stay in sync for the next iteration of
  // RestirPTShader, which will always use only the first reservoir buffer
  reservoirBuffer2[idx] = reservoir;

  radianceInput[idx] += reservoir.rad;
  samplesCount[idx] += 1;
}
`;
