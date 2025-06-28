export const getReSTIRRandomPart = /* wgsl */ `
const RANDOMS_VEC4F_ARRAY_COUNT = 50;
const RANDOMS_SAMPLES_COUNT = RANDOMS_VEC4F_ARRAY_COUNT * 4;
var<private> randomsOffset: f32 = 0;
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

  // you can't do blue noise decorrelation since you only have access to a seed when initializing 
  // randoms, and blue noise decorrelation requires you to "overlay" blue noise offsets from
  // the pixels on the blue noise image texture. if the pixel adjacent to this one doesn't take
  // the blue noise offsets that are adjacent on the image texture, decorrelation obviously wont work
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
