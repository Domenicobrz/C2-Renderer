export const getReSTIRRandomPart = /* wgsl */ `
const RANDOMS_VEC4F_ARRAY_COUNT = 50;
const RANDOMS_SAMPLES_COUNT = RANDOMS_VEC4F_ARRAY_COUNT * 4;
var<private> randomsOffset: f32 = 0;
var<private> randomsOffsetsArray = array<f32, 8>(0,0,0,0,0,0,0,0);
var<private> randomsOffsetsArrayIndex: u32 = 0;
var<private> randomsSeed: u32 = 0;
var<private> randomsCount: u32 = 0;

// we're forcing every routine of the renderer to request a 2D
// random sample, such that we can make sure that those samples are
// well distributed in those 2 dimensions, this makes it simpler
// to create the blue noise sampler, which will group the randoms
// array in groups of 2, with points well distributed in each of those 2 dimensions  
fn getRand2D() -> vec2f {
  // let hr = randomsCount / 2;
  // let rmod = mod1u(randomsCount, 2);
  // let rands = rand4(randomsSeed + hr * 199087573);
  // randomsCount++;

  // if (rmod == 0) {
  //   return rands.xy;
  // }
  // return rands.zw;

  // let rands = rand4(randomsSeed + randomsCount * 1099087573);
  // randomsCount++;
  // return rands.xy;

  randomsSeed = hashCounter(randomsSeed, randomsCount);
  let rands = rand4(randomsSeed);
  randomsCount++;
  return rands.xy;
}

fn initializeRandoms(seed: u32) {
  // re-setting the variables, in ReSTIR PT we'll call initializeRandoms() more than once
  randomsSeed = seed;
  randomsCount = 0;

  randomsOffset = 0;
  randomsOffsetsArray = array<f32, 8>(0,0,0,0,0,0,0,0);
  randomsOffsetsArrayIndex = 0;

  // if (
  //   config.SAMPLER_DECORRELATION == DECORRELATION_BLUE_NOISE_MASK
  // ) {
  //   let tx1 = mod1u(tid.x, 256);
  //   let ty1 = mod1u(tid.y, 256);
  //   let blueNoise1 = textureLoad(blueNoise256, vec2u(tx1, ty1), 0);
  //   let tx2 = mod1u(tid.x + 128, 256);
  //   let ty2 = mod1u(tid.y + 128, 256);
  //   let blueNoise2 = textureLoad(blueNoise256, vec2u(tx2, ty2), 0);
  
  //   randomsOffsetsArray[0] = blueNoise1.x;
  //   randomsOffsetsArray[1] = blueNoise1.y;
  //   randomsOffsetsArray[2] = blueNoise1.z;
  //   randomsOffsetsArray[3] = blueNoise1.w;
  //   randomsOffsetsArray[4] = blueNoise2.x;
  //   randomsOffsetsArray[5] = blueNoise2.y;
  //   randomsOffsetsArray[6] = blueNoise2.z;
  //   randomsOffsetsArray[7] = blueNoise2.w;
  // }
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

var<private> randomsArrayIndex2: u32 = 0;
var<private> randomsOffset2: f32 = 0.0;

fn initializeRandoms2(tid: vec3u) {
  randomsArrayIndex2 = 0;
  randomsOffset2 = 0.0;
  let pseudoRands = rand4(tid.x * 7189357 + tid.y * 5839261);

  randomsOffset2 = pseudoRands.x;
  randomsArrayIndex2 = u32(pseudoRands.y * 0.5 * f32(RANDOMS_VEC4F_ARRAY_COUNT-1)) * 2;
}

fn getRand2D_2() -> vec2f {
  var rands = vec2f(0.0);

  for (var i = 0; i < 2; i++) {
    let currentSample = uniformRandom[randomsArrayIndex2 / 4];
    let modulo = mod1u(randomsArrayIndex2, 4);
    let sample = selectRandomArraySampleComponent(currentSample, modulo);

    randomsArrayIndex2++;
    if (randomsArrayIndex2 >= RANDOMS_VEC4F_ARRAY_COUNT) {
      randomsArrayIndex2 = 0;
    }

    var offset = randomsOffset2;
    let value = min(fract(sample + offset), 0.99999999);

    if (i == 0) {
      rands.x = value;
    } else {
      rands.y = value;
    }
  }

  return rands;
};
`;
