export const pbrtMathUtilsPart = /* wgsl */ `
fn SameHemisphere(w: vec3f, wp: vec3f) -> bool {
  return w.z * wp.z > 0;
}
fn AbsDot(v1: vec3f, v2: vec3f) -> f32 { 
  return abs(dot(v1, v2)); 
}
fn FaceForward(n: vec3f, v: vec3f) -> vec3f {
  if (dot(n, v) < 0) { 
    return -n;
  } else {
    return n;
  }
}
fn LengthSquared(v: vec3f) -> f32 { 
  return Sqr(v.x) + Sqr(v.y) + Sqr(v.z); 
}
fn LengthSquaredV2(v: vec2f) -> f32 { 
  return Sqr(v.x) + Sqr(v.y); 
}
fn SampleUniformDiskPolar(u: vec2f) -> vec2f {
  let r = sqrt(u.x);
  let theta = 2 * PI * u.y;
  return vec2f(r * cos(theta), r * sin(theta));
}
fn Lerp(x: f32, a: f32, b: f32) -> f32 {
  return (1 - x) * a + x * b;
}
fn CosTheta(w: vec3f) -> f32 { 
  return w.z; 
}
fn AbsCosTheta(w: vec3f) -> f32 { 
  return abs(w.z); 
}
fn Sqr(v: f32) -> f32 {
  return v * v;
}
fn Cos2Theta(w: vec3f) -> f32 { 
  return Sqr(w.z); 
}
fn Sin2Theta(w: vec3f) -> f32 { 
  return max(0, 1 - Cos2Theta(w)); 
}
fn SinTheta(w: vec3f) -> f32 { 
  return sqrt(Sin2Theta(w)); 
}
fn Tan2Theta(w: vec3f) -> f32 { 
  return Sin2Theta(w) / Cos2Theta(w); 
}
fn CosPhi(w: vec3f) -> f32 {
  let sinTheta = SinTheta(w);
  if (sinTheta == 0) {
    return 1;
  } else {
    return clamp(w.x / sinTheta, -1, 1);
  }
}
fn SinPhi(w: vec3f) -> f32 {
  let sinTheta = SinTheta(w);
  if (sinTheta == 0) {
    return 0;
  } else {
    return clamp(w.y / sinTheta, -1, 1);
  }
}
fn IsInf(v: f32) -> bool {
  return v > 999999999999999.0;
}
fn SchlickFresnel(r0: vec3f, radians: f32) -> vec3f {
  // -- The common Schlick Fresnel approximation
  let exponential = pow(1.0 - radians, 5.0);
  return r0 + (1.0f - r0) * exponential;
}
fn Reflect(wo: vec3f, n: vec3f) -> vec3f {
  return -wo + 2.0 * dot(wo, n) * n;
}
fn Refract(
  wi: vec3f, _n: vec3f, _eta: f32, etap: ptr<function, f32>, wt: ptr<function, vec3f>
) -> bool {
  var n = _n;
  var eta = _eta;
  var cosTheta_i = dot(n, wi);

  if (cosTheta_i < 0) {
    eta = 1 / eta;
    cosTheta_i = -cosTheta_i;
    n = -n;
  }

  let sin2Theta_i = max(0, 1 - Sqr(cosTheta_i));
  let sin2Theta_t = sin2Theta_i / Sqr(eta);
  if (sin2Theta_t >= 1) {
    return false;
  }

  let cosTheta_t = sqrt(1 - sin2Theta_t);

  *wt = -wi / eta + (cosTheta_i / eta - cosTheta_t) * n;
  *etap = eta;

  return true;
}

fn boundsOffset2D(domain: AABB, p: vec2f) -> vec2f {
  var o = p - vec2f(domain.min.x, domain.min.y);

  if (domain.max.x > domain.min.x) { 
    o.x /= domain.max.x - domain.min.x;
  }

  if (domain.max.y > domain.min.y) { 
    o.y /= domain.max.y - domain.min.y; 
  }

  return o;
}
`;
