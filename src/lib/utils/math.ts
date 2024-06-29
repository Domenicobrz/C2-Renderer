import { Vector2, Vector3 } from 'three';

export function vec2(x: number, y: number) {
  return new Vector2(x, y);
}

export function vec3(x: number, y: number, z: number) {
  return new Vector3(x, y, z);
}

export function copySign(mag: number, sign: number) {
  return mag * (sign < 0 ? -1 : 1);
}
