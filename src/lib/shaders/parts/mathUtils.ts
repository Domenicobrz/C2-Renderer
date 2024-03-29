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
`;
