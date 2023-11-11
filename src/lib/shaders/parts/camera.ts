export const cameraPart = /* wgsl */ `
struct Camera {
  position: vec3f,
  fov: f32,
  rotationMatrix: mat3x3f,
}
struct Ray {
  origin: vec3f,
  direction: vec3f,
}
`;
