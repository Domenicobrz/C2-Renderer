export const getRandomPart = /* wgsl */ `
const RANDOMS_VEC4F_ARRAY_COUNT = 50;
var<private> randomsArrayIndex: u32 = 0;
var<private> randomsOffset: f32 = 0;
var<private> tidd: vec3u = vec3u(0);
var<private> si: u32 = 0;

fn getRandom() -> f32 {
  let currentSample = haltonSamples[randomsArrayIndex / 4];
  let modulo = mod1u(randomsArrayIndex, 4);
  let sample = selectRandomArraySampleComponent(currentSample, modulo);

  randomsArrayIndex++;
  if (randomsArrayIndex >= RANDOMS_VEC4F_ARRAY_COUNT) {
    randomsArrayIndex = 0;
  }

  return min(fract(sample + randomsOffset), 0.99999999);
  // return sample;
  // return clamp(sample, 0.000001, 0.999999);
  // return rand4(u32(randomsOffset * 98723659) + u32(sample * 89302723)).x;
  // return rand4(u32(sample * 89302723)).x;
  // return rand4(tidd.x * 987123659 + tidd.y * 34675309 + si * 42795873 + randomsArrayIndex * 38859239).x;
}

fn initializeRandoms(tid: vec3u, sampleIndex: u32) {
  tidd = tid;
  si = sampleIndex;

  // I think that if I also use sampleIndex below I'd thwart the halton sequence,
  // since successive samples will have random offsets compared to where they should
  // have been had I simply used the sequence
  // let pseudoRands = rand4(tid.x * 987657 + tid.y * 346799 + sampleIndex * 427693);
  let pseudoRands = rand4(tid.x * 987657 + tid.y * 346799);
  // let pseudoRands = rand4(tid.x * 98723659 + tid.y * 346795309);
  // let pseudoRands = rand4(tid.x * 981729 + tid.y * 346178);
  randomsOffset = pseudoRands.x;
  // randomsArrayIndex = u32(pseudoRands.y * f32(RANDOMS_VEC4F_ARRAY_COUNT-2));
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
