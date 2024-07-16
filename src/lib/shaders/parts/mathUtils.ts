export const mathUtilsPart = /* wgsl */ `

const PI = 3.14159265359;

fn squaredLength(v: vec3f) -> f32 {
  return dot(v, v);
}

fn getCoordinateSystem(N: vec3f, Nt: ptr<function, vec3f>, Nb: ptr<function, vec3f>) {
  if (abs(N.x) > abs(N.y)) {
    *Nt = vec3f(N.z, 0, -N.x) / sqrt(N.x * N.x + N.z * N.z);
  }  else {
    *Nt = vec3f(0, -N.z, N.y) / sqrt(N.y * N.y + N.z * N.z);
  }
  
  // I'm setting - cross to convert it to a left-handed coordinate system
  // to be consistent with the rest of the app
  *Nb = -cross(N, *Nt);
}

fn sphericalToCartesian(theta: f32, phi: f32) -> vec3f {
  return vec3f(
    cos(phi) * sin(theta),
    cos(theta),
    sin(phi) * sin(theta),
  );
}

/* 
  !!NOTE!! this is different from:
  var Nt = vec3f(0,0,0);
  var Nb = vec3f(0,0,0);
  getCoordinateSystem(N, &Nt, &Nb);
  
  ray.direction = normalize(Nt * nd.x + N * nd.y + Nb * nd.z);

  because what we're doing in the last line is ***rotating*** a vector into where it would 
  go in another coordinate system.

  here instead we're not *rotating* the vector, but expressing it with another coordinate system
*/
fn expressInAnotherCoordinateSystem(
  direction: vec3f, basisX: vec3f, basisY: vec3f, basisZ: vec3f
) -> vec3f {
  // "how much of x"
  let hmox = dot(direction, basisX);
  let hmoy = dot(direction, basisY);
  let hmoz = dot(direction, basisZ);
  
  return vec3f(hmox, hmoy, hmoz); 
}

// a NaN is never equal to any other floating point number,
// even another NaN.
// https://www.w3.org/TR/WGSL/#indeterminate-values
fn isFloatNaN(value: f32) -> bool {
  return !(value == value);
}

// https://learnopengl.com/Advanced-Lighting/Normal-Mapping
fn getTangentFromTriangle(
  triangle: Triangle, tangent: ptr<function, vec3f>, bitangent: ptr<function, vec3f>
) {

  let t = triangle;

  // check if uvs exist, if they do let's use uv-based tangents
  if (t.uv0.x > -1) {
    let edge1 = t.v1 - t.v0;
    let edge2 = t.v2 - t.v0;
    let deltaUV1 = t.uv1 - t.uv0;
    let deltaUV2 = t.uv2 - t.uv0;  
  
    let f = 1.0 / (deltaUV1.x * deltaUV2.y - deltaUV2.x * deltaUV1.y);
    *tangent = normalize(vec3f(
      f * (deltaUV2.y * edge1.x - deltaUV1.y * edge2.x),
      f * (deltaUV2.y * edge1.y - deltaUV1.y * edge2.y),
      f * (deltaUV2.y * edge1.z - deltaUV1.y * edge2.z)
    ));
  
    // for some reason, specifying the bitangent this way causes issues
    // *bitangent = normalize(vec3f(
    //   f * (-deltaUV2.x * edge1.x + deltaUV1.x * edge2.x),
    //   f * (-deltaUV2.x * edge1.y + deltaUV1.x * edge2.y),
    //   f * (-deltaUV2.x * edge1.z + deltaUV1.x * edge2.z)
    // ));
  
    *bitangent = normalize(cross(*tangent, t.normal));
  } else {
    // otherwise default to auto geometry-based tangents
    *tangent = normalize(t.v1 - t.v0);
    *bitangent = normalize(cross(*tangent, t.normal));
  }
}

fn copysign(mag: f32, sign: f32) -> f32 {
  var s: f32 = 0;
  if (sign < 0) {
    s = -1;
  } else {
    s = 1;
  }

  return mag * s;
}
`;
