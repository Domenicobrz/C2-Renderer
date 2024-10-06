import { Vector3 } from 'three';

export class Plane {
  private normal: Vector3;
  private distance: number;

  constructor(normal: Vector3, distance: number) {
    this.normal = normal;
    this.distance = distance;
  }

  intersectRay(ro: Vector3, rd: Vector3): { hit: boolean; t: number; hitPoint: Vector3 } {
    let denom = this.normal.dot(rd);

    // Prevent divide by zero:
    if (Math.abs(denom) <= 1e-4) {
      return {
        hit: false,
        t: -1,
        hitPoint: new Vector3(0, 0, 0)
      };
    }

    // If you want to ensure the ray reflects off only
    // the "top" half of the plane, use this instead:
    //
    // if (-denom <= 1e-4f)
    //     return std::nullopt;

    let t = -(this.normal.dot(ro) + this.distance) / this.normal.dot(rd);

    // Use pointy end of the ray.
    // It is technically correct to compare t < 0,
    // but that may be undesirable in a raytracer.
    if (t <= 1e-4) {
      return {
        hit: false,
        t: -1,
        hitPoint: new Vector3(0, 0, 0)
      };
    }

    return {
      hit: true,
      t,
      hitPoint: ro.clone().add(ro.clone().multiplyScalar(t))
    };
  }

  static shaderMethods() {
    return /* wgsl */ `
      fn intersectPlane(
        ray: Ray, n: vec3f, d: f32, hitPoint: ptr<function, vec3f>
      ) -> bool {
        let denom = dot(n, ray.direction);
      
        // Prevent divide by zero:
        if (abs(denom) <= 1e-4f) {
          *hitPoint = vec3f(0.0);
          return false;
        }
      
        // If you want to ensure the ray reflects off only
        // the "top" half of the plane, use this instead:
        //
        // if (-denom <= 1e-4f)
        //     return std::nullopt;
      
        let t = -(dot(n, ray.origin) + d) / dot(n, ray.direction);
      
        // Use pointy end of the ray.
        // It is technically correct to compare t < 0,
        // but that may be undesirable in a raytracer.
        if (t <= 1e-4) {
          *hitPoint = vec3f(0.0);
          return false;
        }
      
        *hitPoint = ray.origin + t * ray.direction;
        return true;
      };
    `;
  }
}
