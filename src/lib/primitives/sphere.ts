import type { Vector3 } from 'three';

export class Sphere {
  constructor(public center: Vector3, public radius: Vector3, public materialOffset: number) {}

  static getBufferData(spheres: Sphere[]) {
    throw new Error('not implemented');
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct Sphere {
        center: vec3f,
        radius: f32,
      }
    `;
  }

  static shaderIntersectionFn(): string {
    return /* wgsl */ `
      fn intersectSphere(sphere: Sphere, ray: Ray) -> IntersectionResult {
        let OC = vec3f(
          ray.origin.x - sphere.center.x,
          ray.origin.y - sphere.center.y,
          ray.origin.z - sphere.center.z,
        );
        
        // Solve the quadratic equation a t^2 + 2 t b + c = 0
        let a = squaredLength(ray.direction);
        let b = dot(ray.direction, OC);
        let c = squaredLength(OC) - sphere.radius * sphere.radius;
        let delta = b * b - a * c;
        
        if (delta < 0) {  // No solution
          return IntersectionResult(false, 0, vec3f(0));
        }
      
        // One or two solutions, take the closest (positive) intersection
        let sqrtDelta = sqrt(delta);
      
        // a >= 0
        let tMin = (-b - sqrtDelta) / a;
        let tMax = (-b + sqrtDelta) / a;
      
        if (tMax < 0) {  // All intersection points are behind the origin of the ray
          return IntersectionResult(false, 0, vec3f(0));
        }
      
        // tMax >= 0
        // let t = tMin >= 0 ? tMin : tMax; 
        // ---- WGSL doesn't have a ternary operator 
        // ---- select(falseExpression, trueExpression, condition);
        let t = select(tMax, tMin, tMin >= 0);
      
        let intersectionPoint = vec3f(
          ray.origin.x + t * ray.direction.x,
          ray.origin.y + t * ray.direction.y,
          ray.origin.z + t * ray.direction.z,
        );
        
        return IntersectionResult(true, t, intersectionPoint);
      }
    `;
  }
}
