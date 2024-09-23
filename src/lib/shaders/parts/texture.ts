export const texturePart = /* wgsl */ `
fn getTexelFromTextureArrays(location: vec2i, uv: vec2f) -> vec4f {
  let resolution = location.x;
  var texel: vec4f;
  if (resolution == 0) {
    let indices = vec2u(
      u32(uv.x * 128.0),
      u32(uv.y * 128.0),
    );
    texel = textureLoad(textures128, indices, location.y, 0);
  }
  if (resolution == 1) {
    let indices = vec2u(
      u32(uv.x * 512.0),
      u32(uv.y * 512.0),
    );
    texel = textureLoad(textures512, indices, location.y, 0);
  }
  if (resolution == 2) {
    let indices = vec2u(
      u32(uv.x * 1024),
      u32(uv.y * 1024),
    );
    texel = textureLoad(textures1024, indices, location.y, 0);
  }
  return texel;
}
`;
