// from:
// https://indico.cern.ch/event/93877/contributions/2118070/attachments/1104200/1575343/acat3_revised_final.pdf

// I did change some things from the original algorithm, which also has variants that I
// haven't implemented. I removed all of the ulong types and switched ints for uints
// I have no idea if the numbers are still correct or not
export const randomPart = /* wgsl */ `

// MurmurHash3 32-bit mix function
fn murmurHash3(key: u32, seed: u32) -> u32 {
  var k = key;
  k *= 0xcc9e2d51u;
  k = (k << 15u) | (k >> (32u - 15u));
  k *= 0x1b873593u;
  var h = seed;
  h ^= k;
  h = (h << 13u) | (h >> (32u - 13u));
  h = h * 5u + 0xe6546b64u;
  h ^= h >> 16u;
  return h;
}

// Combine pixel coordinates and a CPU seed into a single hash
fn hashPixelAndSeed(tid: vec2<u32>, cpuSeed: u32) -> u32 {
  // Pack the coordinates into one 32-bit key.
  // Assumes tid.x and tid.y are less than 65536.
  let key = (tid.x << 16u) | (tid.y & 0xffffu);
  return murmurHash3(key, cpuSeed);
}

// Combine the base seed with the counter using a robust hash.
fn hashCounter(baseSeed: u32, count: u32) -> u32 {
  // Here we use a mixing constant (the golden ratio approximation) to help decorrelate the counter.
  let combined = baseSeed ^ (count * 0x9e3779b9u);
  return murmurHash3(combined, 0);
}

fn seed_per_thread(id: u32) -> u32 {
  return u32(id * 1099087573);
}

fn TauStep(z: u32, s1: u32, s2: u32, s3: u32, M: u32) -> u32 {
  let b: u32 =(((z << s1) ^ z) >> s2);
  let t = (((z & M) << s3) ^ b);
  return t;
}

fn rand4(seedIdx: u32) -> vec4f {
  //STEP 1
  // let seed=seed_per_thread(seedIdx);
  let seed=seedIdx;
  var z1=TauStep(seed,13,19,12,429496729);
  var z2=TauStep(seed,2,25,4,4294967288);
  var z3=TauStep(seed,3,11,17,429496280);
  var z4=(1664525*seed+1013904223);
  let r0=(z1^z2^z3^z4);

  //STEP 2
  z1=TauStep(r0,13,19,12,429496729);
  z2=TauStep(r0,2,25,4,4294967288);
  z3=TauStep(r0,3,11,17,429496280);
  z4=(1664525*r0+1013904223);
  let r1=(z1^z2^z3^z4);

  //STEP 3
  z1=TauStep(r1,13,19,12,429496729);
  z2=TauStep(r1,2,25,4,4294967288);
  z3=TauStep(r1,3,11,17,429496280);
  z4=(1664525*r1+1013904223);
  let r2=(z1^z2^z3^z4);

  //STEP 4
  z1=TauStep(r2,13,19,12,429496729);
  z2=TauStep(r2,2,25,4,4294967288);
  z3=TauStep(r2,3,11,17,429496280);
  z4=(1664525*r2+1013904223);
  let r3=(z1^z2^z3^z4);

  // u1, u2, u3 and u4 varies between 0 and 1.0
  var u1 = f32(r0) * f32(2.3283064365387e-10);
  var u2 = f32(r1) * f32(2.3283064365387e-10);
  var u3 = f32(r2) * f32(2.3283064365387e-10);
  var u4 = f32(r3) * f32(2.3283064365387e-10);

  // they have to be clamped, we can't assume that they go up to 1.0
  // apparently the original algo will have them go up to 1.0
  // if they do go up to 1.0, some algorithms like PC1D_FindCDFIndex could fail
  u1 = clamp(u1, 0.0, 0.9999999);
  u2 = clamp(u2, 0.0, 0.9999999);
  u3 = clamp(u3, 0.0, 0.9999999);
  u4 = clamp(u4, 0.0, 0.9999999);

  return vec4f(u1, u2, u3, u4);
}
`;
