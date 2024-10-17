export const mathUtilsPart = /* wgsl */ `

const PI = 3.14159265359;

fn squaredLength(v: vec3f) -> f32 {
  return dot(v, v);
}

// this function did not really work, it caused issues at the abs(x) > abs(y) boundaries
// when trying to create a TBN matrix to use for diffuse directions
// the issue was visible in a cornell-sphere scene with only 3 bounces.
// strangely up to 2 bounces the result was okay, but at the third bounce 
// problems where visible if the third (index = 2) bounce hit the sphere
// fn getCoordinateSystem(N: vec3f, Nt: ptr<function, vec3f>, Nb: ptr<function, vec3f>) {
//   if (abs(N.x) > abs(N.y)) {
//     *Nt = normalize(vec3f(N.z, 0, -N.x) / sqrt(N.x * N.x + N.z * N.z));
//   }  else {
//     *Nt = normalize(vec3f(0, -N.z, N.y) / sqrt(N.y * N.y + N.z * N.z));
//   }
  
//   // I'm setting - cross to convert it to a left-handed coordinate system
//   // to be consistent with the rest of the app
//   *Nb = normalize(-cross(N, *Nt));
// }

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
  triangle: Triangle, shadingNormal: vec3f, tangent: ptr<function, vec3f>, bitangent: ptr<function, vec3f>
) {

  let t = triangle;
  var malconstructedUvs = false;

  // check if uvs exist, if they do let's use uv-based tangents
  if (t.uv0.x > -1) {
    let edge1 = t.v1 - t.v0;
    let edge2 = t.v2 - t.v0;
    let deltaUV1 = t.uv1 - t.uv0;
    let deltaUV2 = t.uv2 - t.uv0;  
  
    let div = (deltaUV1.x * deltaUV2.y - deltaUV2.x * deltaUV1.y);
    let f = 1.0 / div;
    if (div == 0.0) {
      malconstructedUvs = true;
    }

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
  
    *bitangent = normalize(cross(*tangent, t.geometricNormal));
  } 
  
  if (t.uv0.x < -0.9 || malconstructedUvs) {
    // otherwise default to auto geometry-based tangents
    *tangent = normalize(t.v1 - t.v0);
    *bitangent = normalize(cross(*tangent, t.geometricNormal));
  }

  // the tangents above are calculated with the geometric normal (picked from ires.triangle)
  // and have to be adjusted to use the vertex/shading normal
  *tangent = normalize(cross(shadingNormal, *bitangent));
  *bitangent = normalize(cross(*tangent, shadingNormal));
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

// from openPBR:
// https://academysoftwarefoundation.github.io/OpenPBR/#model/microfacetmodel
fn anisotropyRemap(roughness: f32, anisotropy: f32) -> vec2f {
  let at = (roughness * roughness) * sqrt(2.0 / (1.0 + (1.0 - anisotropy) * (1.0 - anisotropy)));
  let ab = (1.0 - anisotropy) * at;
  return vec2f(at, ab);
} 

fn mod1f(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}
fn mod3f(a: vec3f, b: vec3f) -> vec3f {
  return vec3f(
    a.x - b.x * floor(a.x / b.x),
    a.y - b.y * floor(a.y / b.y),
    a.z - b.z * floor(a.z / b.z),
  );
}
`;
