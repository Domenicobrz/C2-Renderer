export const renderShader = /* wgsl */`
struct VSOutput {
  @builtin(position) position: vec4f,
  @location(0) texcoord: vec2f,
};

@group(0) @binding(0) var<storage> data: array<vec3f>;
@group(0) @binding(1) var<uniform> canvasSize: vec2u;

@vertex fn vs(
  @builtin(vertex_index) vertexIndex : u32
) -> VSOutput {
  let pos = array(
    vec2f(0.0,  0.0),  // center
    vec2f(1.0,  0.0),  // right, center
    vec2f(0.0,  1.0),  // center, top

    // 2st triangle
    vec2f(0.0,  1.0),  // center, top
    vec2f(1.0,  0.0),  // right, center
    vec2f(1.0,  1.0),  // right, top
  );

  var vsOutput: VSOutput;
  let xy = pos[vertexIndex];

  vsOutput.position = vec4f(xy * 2 - 1, 0.0, 1.0);
  vsOutput.texcoord = xy;
  
  return vsOutput;
}

@fragment fn fs(fsInput: VSOutput) -> @location(0) vec4f {
  let x = u32(floor(fsInput.texcoord.x * f32(canvasSize.x)));
  let y = u32(floor(fsInput.texcoord.y * f32(canvasSize.y)));
  let idx: u32 = y * canvasSize.x + x;
  
  return vec4f(data[idx], 1);
}
`;