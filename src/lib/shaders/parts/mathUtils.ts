export const mathUtilsPart = /* wgsl */ `

fn squaredLength(v: vec3f) -> f32 {
  return dot(v, v);
}

fn getCoordinateSystem(N: vec3f, Nt: ptr<function, vec3f>, Nb: ptr<function, vec3f>) {
  if (abs(N.x) > abs(N.y)) {
    *Nt = vec3f(N.z, 0, -N.x) / sqrt(N.x * N.x + N.z * N.z);
  }  else {
    *Nt = vec3f(0, -N.z, N.y) / sqrt(N.y * N.y + N.z * N.z);
  }
  
  *Nb = cross(N, *Nt);
}

`;
