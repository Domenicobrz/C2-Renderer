export const getRandomPart = /* wgsl */ `
const RANDOMS_VEC4F_ARRAY_COUNT = 50;
var<private> randomsArrayIndex: u32 = 0;
var<private> randomsOffset: f32 = 0;
var<private> randomsOffsetsArray = array<f32, 8>(0,0,0,0,0,0,0,0);
var<private> randomsOffsetsArrayIndex: u32 = 0;

// we're forcing every routine of the renderer to request a 2D
// random sample, such that we can make sure that those samples are
// well distributed in those 2 dimensions, this makes it simpler
// to create the blue noise sampler, which will group the randoms
// array in groups of 2, with points well distributed in each of those 2 dimensions  
fn getRand2D() -> vec2f {
  var rands = vec2f(0.0);

  for (var i = 0; i < 2; i++) {
    let currentSample = haltonSamples[randomsArrayIndex / 4];
    let modulo = mod1u(randomsArrayIndex, 4);
    let sample = selectRandomArraySampleComponent(currentSample, modulo);

    randomsArrayIndex++;
    if (randomsArrayIndex >= RANDOMS_VEC4F_ARRAY_COUNT) {
      randomsArrayIndex = 0;
    }

    var offset = 0.0;

    if (
      config.SAMPLER_DECORRELATION == DECORRELATION_BLUE_NOISE_MASK
    ) {
      offset = randomsOffsetsArray[randomsOffsetsArrayIndex];
      randomsOffsetsArrayIndex = mod1u(randomsOffsetsArrayIndex + 1, 8);
    } else {
      offset = randomsOffset;
    }

    let value = min(fract(sample + offset), 0.99999999);

    if (i == 0) {
      rands.x = value;
    } else {
      rands.y = value;
    }
  }

  return rands;
}

fn initializeRandoms(tid: vec3u, sampleIndex: u32) {
  // re-setting the variables, in ReSTIR PT we'll call initializeRandoms() more than once
  randomsArrayIndex = 0;
  randomsOffset = 0;
  randomsOffsetsArray = array<f32, 8>(0,0,0,0,0,0,0,0);
  randomsOffsetsArrayIndex = 0;

  // I think that if I also use sampleIndex below I'd thwart the halton sequence,
  // since successive samples will have random offsets compared to where they should
  // have been had I simply used the sequence itself
  // let pseudoRands = rand4(tid.x * 987657 + tid.y * 346799 + sampleIndex * 427693);
  let pseudoRands = rand4(tid.x * 987657 + tid.y * 346799);

  if (
    config.SAMPLER_DECORRELATION == DECORRELATION_RAND_OFFSET || 
    config.SAMPLER_DECORRELATION == DECORRELATION_RAND_ARRAY_OFFSET
  ) {
    randomsOffset = pseudoRands.x;
  }
  
  if (
    config.SAMPLER_DECORRELATION == DECORRELATION_RAND_ARRAY_OFFSET
  ) {
    // we're multiplying by 2 the offset to respect the 2D distribution we're forcing
    // with getRand2D();
    randomsArrayIndex = u32(pseudoRands.y * 0.5 * f32(RANDOMS_VEC4F_ARRAY_COUNT-1)) * 2;
  }

  if (
    config.SAMPLER_DECORRELATION == DECORRELATION_BLUE_NOISE_MASK
  ) {
    let tx1 = mod1u(tid.x, 256);
    let ty1 = mod1u(tid.y, 256);
    let blueNoise1 = textureLoad(blueNoise256, vec2u(tx1, ty1), 0);
    let tx2 = mod1u(tid.x + 128, 256);
    let ty2 = mod1u(tid.y + 128, 256);
    let blueNoise2 = textureLoad(blueNoise256, vec2u(tx2, ty2), 0);
  
    randomsOffsetsArray[0] = blueNoise1.x;
    randomsOffsetsArray[1] = blueNoise1.y;
    randomsOffsetsArray[2] = blueNoise1.z;
    randomsOffsetsArray[3] = blueNoise1.w;
    randomsOffsetsArray[4] = blueNoise2.x;
    randomsOffsetsArray[5] = blueNoise2.y;
    randomsOffsetsArray[6] = blueNoise2.z;
    randomsOffsetsArray[7] = blueNoise2.w;
  }
}

fn selectRandomArraySampleComponent(sample: vec4f, index: u32) -> f32 {
  switch index {
    case 0: { return sample.x; }
    case 1: { return sample.y; }
    case 2: { return sample.z; }
    case 3: { return sample.w; }
    default: { return 0.0; } 
  }
}
`;
