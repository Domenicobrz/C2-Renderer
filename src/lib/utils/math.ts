import type { AABB } from '$lib/bvh/aabb';
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

export function lerp(x: number, a: number, b: number) {
  return (1 - x) * a + x * b;
}

export function boundsOffset2D(domain: AABB, p: Vector2): Vector2 {
  let o = p.clone().sub(new Vector2(domain.min.x, domain.min.y));

  if (domain.max.x > domain.min.x) o.x /= domain.max.x - domain.min.x;
  if (domain.max.y > domain.min.y) o.y /= domain.max.y - domain.min.y;

  return o;
}

export function clamp(val: number, low: number, high: number) {
  if (val < low) return low;
  else if (val > high) return high;
  else return val;
}
