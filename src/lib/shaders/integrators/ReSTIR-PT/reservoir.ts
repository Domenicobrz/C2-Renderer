export const reservoirShaderPart = /* wgsl */ `
// this struct will be saved in the reservoir
struct PathInfo {
  F: vec3f,
  // this will be used to make sure the path-shift selects the correct first bounce
  // remember that after the first SR reuse, we may end up using a seed that is different
  // from the seed that generated the first bounce hit. And the pixel-shift always have to land
  // on the original first bounce hit to be useable in the Generalized Balance Heuristic
  firstVertexSeed: u32,
  seed: u32,
  bounceCount: u32,
  /* 
    bit 0: path-end sampled by Light boolean
    bit 1: path-end sampled by BRDF boolean
    bit 2: path ends by escape boolean
    bit 3: path reconnects / doesn't reconnect boolean
    in theory, the remaining bits could contain the bounce count
    bit 16 onward: reconnection lobes x, y
  */
  flags: u32,
  reconnectionBounce: u32,
  jacobian: vec2f, 
  // these are the barycentric coordinates of the triangle, not the uvs.
  // to define a point within a triangle, we can't use texture uvs (they could be scaled/repeated)
  reconnectionBarycentrics: vec2f,  
  reconnectionRadiance: vec3f,
  radianceDirection: vec3f,
  reconnectionTriangleIndex: i32,
}

struct Reservoir {
  Y: PathInfo,
  Gbuffer: vec4f, // normal.xyz, depth at first bounce. depth = -1 if no intersection was found
  Wy: f32,  // probability chain
  c: f32,
  wSum: f32,
  isNull: f32,
  rad: vec3f,
  packedDomain: u32,
}

// this struct does not have to be saved in the reservoir,
// hence why we're creating a separate struct
struct PathSampleInfo {
  // some of these might be unnecessary now that I'm always reconnecting at xkm1
  wasPrevVertexRough: bool,
  prevVertexPosition: vec3f,
  prevVertexBrdf: vec3f,
  brdfPdfPrevVertex: f32,
  lobePdfPrevVertex: f32,
  reconnectionVertexIndex: i32, // -1 signals no reconnection
  postfixThroughput: vec3f,
  prevLobeIndex: i32,
}

struct RandomReplayResult {
  valid: u32,
  pHat: vec3f,
  shouldTerminate: bool,
  jacobian: vec2f,
}

struct PathFlags {
  lightSampled: bool,
  brdfSampled: bool,
  endsInEnvmap: bool,
  reconnects: bool,
  reconnectionLobes: vec2u,
}
`;
