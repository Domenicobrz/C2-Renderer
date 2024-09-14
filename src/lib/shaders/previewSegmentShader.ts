export const previewSegmentShader = /* wgsl */ `
@group(0) @binding(0) var<uniform> viewMatrix: mat4x4f;
@group(0) @binding(1) var<uniform> projectionMatrix: mat4x4f;
@group(0) @binding(2) var<uniform> cameraPos: vec3f;

struct VSOutput {
  @builtin(position) position: vec4f,
  @location(0) fragPos: vec3f,
  @location(1) fragNorm: vec3f,
  @location(2) viewSpaceNorm: vec3f,
  @location(3) cameraPos: vec3f,
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
  let transformed = viewMatrix * vec4f(vert.position, 1.0);
  // I would love to build a proper left-handed projection matrix, and I tried,
  // without success. At one point we should try again and get rid of "* vec4f(1,1,-1,1)"
  vsOutput.position = projectionMatrix * (transformed * vec4f(1,1,-1,1));
  vsOutput.fragPos = vert.position;
  vsOutput.fragNorm = vert.normal;
  vsOutput.viewSpaceNorm = mat3x3f(
    viewMatrix[0].xyz,
    viewMatrix[1].xyz,
    viewMatrix[2].xyz 
  ) * vert.normal;
  vsOutput.cameraPos = cameraPos;
  
  return vsOutput;
}

@fragment fn fs(fsInput: VSOutput) -> @location(0) vec4f {
  var normal = normalize(fsInput.fragNorm);
  let fragPos = fsInput.fragPos;
  let cameraPos = fsInput.cameraPos;

  let viewDir = normalize(fragPos - cameraPos);
  let wo = -viewDir;

  // by using abs(..) instead of max(.., 0.0)
  // I'm correcting for flipped normals
  // let col = abs(dot(wo, normal));
  let col = dot(wo, normal);

  var coloredVSNormal = fsInput.viewSpaceNorm * vec3f(1,1,-1) * 0.5 + 0.5;
  if (dot(wo, normal) < 0.0) {
    coloredVSNormal *= 0.0;
  }
  return vec4f(coloredVSNormal, 1.0);
}
`;
