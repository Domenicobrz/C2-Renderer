export const reservoirFunctionsShaderPart = /* wgsl */ `
fn isSegmentTooShortForReconnection(segment: vec3f) -> bool {
  // return length(segment) < 0.05;
  return length(segment) < 0.15;
  // return length(segment) < 0.5;
  // return length(segment) < 0.85;
  // return length(segment) < 2.5;
  // return false;
  // return true;
}

fn pathReconnects(pi: PathInfo) -> bool {
  return ((pi.flags >> 3) & 1u) == 1;
}

fn pathReconnectsAtLightVertex(pi: PathInfo) -> bool {
  return pathReconnects(pi) && pi.bounceCount == pi.reconnectionBounce;
}

fn pathReconnectsFarFromLightVertex(pi: PathInfo) -> bool {
  return pathReconnects(pi) && pi.bounceCount >= (pi.reconnectionBounce+2);
}

fn pathReconnectsOneVertextBeforeLight(pi: PathInfo) -> bool {
  return pathReconnects(pi) && pi.bounceCount == (pi.reconnectionBounce+1);
}

fn packPathFlags(flags: PathFlags) -> u32 {
  var pathFlags: u32 = 0u; // Use 0u for clarity
  pathFlags |= (u32(flags.lightSampled) << 0u); // u32(bool) is 0u or 1u, so & 1u is not strictly needed
  pathFlags |= (u32(flags.brdfSampled) << 1u);
  pathFlags |= (u32(flags.endsInEnvmap) << 2u);
  pathFlags |= (u32(flags.reconnects) << 3u);  // remember to update pathReconnects(...) if you move this one around
  // Bits 4-15 are currently unused
  // 0xFFu is 255 in decimal, or 0b11111111
  pathFlags |= ((flags.reconnectionLobes.x & 0xFFu) << 16u);
  pathFlags |= ((flags.reconnectionLobes.y & 0xFFu) << 24u);
  return pathFlags;
}

fn unpackPathFlags(packed: u32) -> PathFlags {
  var flags: PathFlags;
  flags.lightSampled = bool((packed >> 0u) & 1u); // bool(u32) converts 0u to false, non-0u to true
  flags.brdfSampled = bool((packed >> 1u) & 1u);
  flags.endsInEnvmap = bool((packed >> 2u) & 1u);
  flags.reconnects = bool((packed >> 3u) & 1u);
  flags.reconnectionLobes.x = (packed >> 16u) & 0xFFu;
  flags.reconnectionLobes.y = (packed >> 24u) & 0xFFu;
  return flags;
}

fn packDomain(domain: vec2i) -> u32 {
  let x_packed: u32 = u32(domain.x) & 0xFFFFu;
  let y_packed: u32 = (u32(domain.y) & 0xFFFFu) << 16u;
  return x_packed | y_packed;
}

fn unpackDomain(packedDomain: u32) -> vec2i {
  var domain: vec2i;
  let x_unsigned16: u32 = packedDomain & 0xFFFFu;
  domain.x = (i32(x_unsigned16 << 16u)) >> 16; 
  let y_unsigned16: u32 = (packedDomain >> 16u) & 0xFFFFu;
  domain.y = (i32(y_unsigned16 << 16u)) >> 16;
  return domain;
}

fn updateReservoir(reservoir: ptr<function, Reservoir>, Y: PathInfo, wi: f32) -> bool {
  (*reservoir).wSum = (*reservoir).wSum + wi;
  let prob = wi / (*reservoir).wSum;

  if (getRand2D_2().x < prob) {
    (*reservoir).Y = Y;
    (*reservoir).isNull = -1.0;
    return true;
  }

  return false;
} 

fn updateReservoirWithConfidence(
  reservoir: ptr<function, Reservoir>, Xi: PathInfo, wi: f32, ci: f32
) -> bool {
  (*reservoir).wSum = (*reservoir).wSum + wi;
  (*reservoir).c = (*reservoir).c + ci;
  let prob = wi / (*reservoir).wSum;

  if (getRand2D_2().x < prob) {
    (*reservoir).Y = Xi;
    (*reservoir).isNull = -1.0;
    return true;
  }
  
  return false;
} 
`;
