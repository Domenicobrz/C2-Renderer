export const blueNoiseDecorrelationPart = /* wgsl */ `
var<private> bnRandomsOffsetsArray = array<f32, 8>(0,0,0,0,0,0,0,0);
var<private> bnRandomsOffsetsArrayIndex: u32 = 0;

fn getBlueNoiseDecorrelationOffset() -> f32 {
  let offset = bnRandomsOffsetsArray[bnRandomsOffsetsArrayIndex];
  bnRandomsOffsetsArrayIndex = mod1u(bnRandomsOffsetsArrayIndex + 1, 8);
  
  return offset;
}

fn initializeBlueNoiseDecorrelationOffsets(tid: vec3u) {
  bnRandomsOffsetsArray = array<f32, 8>(0,0,0,0,0,0,0,0);
  bnRandomsOffsetsArrayIndex = 0;

  let tx1 = mod1u(tid.x, 256);
  let ty1 = mod1u(tid.y, 256);
  let blueNoise1 = textureLoad(blueNoise256, vec2u(tx1, ty1), 0);
  let tx2 = mod1u(tid.x + 128, 256);
  let ty2 = mod1u(tid.y + 128, 256);
  let blueNoise2 = textureLoad(blueNoise256, vec2u(tx2, ty2), 0);

  bnRandomsOffsetsArray[0] = blueNoise1.x;
  bnRandomsOffsetsArray[1] = blueNoise1.y;
  bnRandomsOffsetsArray[2] = blueNoise1.z;
  bnRandomsOffsetsArray[3] = blueNoise1.w;
  bnRandomsOffsetsArray[4] = blueNoise2.x;
  bnRandomsOffsetsArray[5] = blueNoise2.y;
  bnRandomsOffsetsArray[6] = blueNoise2.z;
  bnRandomsOffsetsArray[7] = blueNoise2.w;
}
`;
