export const previewSegmentShader = /* wgsl */ `
@group(0) @binding(0) var<uniform> viewMatrix: mat4x4f;
@group(0) @binding(1) var<uniform> projectionMatrix: mat4x4f;

struct VSOutput {
  @builtin(position) position: vec4f,
  @location(0) fragPos: vec3f,
  @location(1) fragNorm: vec3f,
};

struct Vertex {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
};

@vertex fn vs(
  vert: Vertex,
  @builtin(vertex_index) vertexIndex : u32
) -> VSOutput {
  
  var vsOutput: VSOutput;
  vsOutput.position = projectionMatrix * viewMatrix * vec4f(vert.position, 1.0);
  vsOutput.fragPos = vert.position;
  vsOutput.fragNorm = vert.normal;
  
  return vsOutput;
}

@fragment fn fs(fsInput: VSOutput) -> @location(0) vec4f {
  return vec4f(1.0);
}
`;
