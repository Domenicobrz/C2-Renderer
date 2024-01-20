export const renderShader = /* wgsl */ `
struct VSOutput {
  @builtin(position) position: vec4f,
  @location(0) texcoord: vec2f,
};

@group(0) @binding(0) var<storage> data: array<vec3f>;
@group(0) @binding(1) var<uniform> canvasSize: vec2u;

@group(1) @binding(0) var<uniform> samplesCount: u32;

const toneMappingExposure = 1.0;

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

fn RRTAndODTFit( v: vec3f ) -> vec3f {
  let a: vec3f = v * ( v + 0.0245786 ) - 0.000090537;
  let b: vec3f = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
  return a / b;
}

fn ACESFilmicToneMapping( _color: vec3f ) -> vec3f {
  const ACESInputMat: mat3x3f = mat3x3f(
    vec3f( 0.59719, 0.07600, 0.02840 ), vec3f( 0.35458, 0.90834, 0.13383 ), vec3f( 0.04823, 0.01566, 0.83777 )
  );
  const ACESOutputMat: mat3x3f = mat3x3f(
    vec3f(  1.60475, -0.10208, -0.00327 ), vec3f( -0.53108, 1.10813, -0.07276 ), vec3f( -0.07367, -0.00605, 1.07602 )
  );
  var color = _color;
  color *= toneMappingExposure / 0.6;
  color = ACESInputMat * color;
  color = RRTAndODTFit( color );
  color = ACESOutputMat * color;
  return clamp( color, vec3f(0.0), vec3f(1.0) );
}

fn lessThanEqual(val1: vec3f, val2: vec3f) -> vec3f {
  var res = vec3f(0.0);
  if (val1.x <= val2.x) { res.x = 1.0; }
  if (val1.y <= val2.y) { res.y = 1.0; }
  if (val1.z <= val2.z) { res.z = 1.0; }
  return res;
}

fn LinearTosRGB( value: vec4f ) -> vec4f {
  return vec4f( mix( pow( value.rgb, vec3f( 0.41666 ) ) * 1.055 - vec3f( 0.055 ), value.rgb * 12.92, vec3f( lessThanEqual( value.rgb, vec3f( 0.0031308 ) ) ) ), value.a );
}

// vec3 tonemapped = ACESFilmicToneMapping(totalRadiance);
// vec4 gammaCorrected = LinearTosRGB(vec4(tonemapped, 1.0));
// gl_FragColor = gammaCorrected;


@fragment fn fs(fsInput: VSOutput) -> @location(0) vec4f {
  let x = u32(floor(fsInput.texcoord.x * f32(canvasSize.x)));
  let y = u32(floor(fsInput.texcoord.y * f32(canvasSize.y)));
  let idx: u32 = y * canvasSize.x + x;

  let radiance = data[idx] / f32(samplesCount);
  let tonemapped = ACESFilmicToneMapping(radiance);
  let gammaCorrected = LinearTosRGB(vec4f(tonemapped, 1.0));

  return gammaCorrected;  
}
`;
