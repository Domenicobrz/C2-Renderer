export const primitivesPart = /* wgsl */ `

struct IntersectionResult {
  hit: bool,
  t: f32,
  hitPoint: vec3f,
}

struct Sphere {
  center: vec3f,
  radius: f32,
}

// this layout saves some bytes because of padding
// https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001000d01000000000000003d8888623728a306fc320e1a9be64fe4a78fb96672809837146b791dbfd602ece649c10ded4c6d44700b69a806355e6f8008795f3a1b099b84f7fd01cd321fc156a3d282b272856d2989c802b61dcac5696368aad51d177d2dc38a1df3bc687ee2b3a55aa6d9aa10112f3e56e06149cecd45408f4acb4eac34048021eb345d8e56e498e66aeea300847212f3dc175721ae58a5cd77ac2444642259d6a2b11637ffd8ec1f00
struct Triangle {
  v0: vec3f,
  v1: vec3f,
  v2: vec3f,
  normal: vec3f,
  // first element of a material tells us the type
  materialOffset: u32,
}

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

// https://github.com/johnnovak/raytriangle-test
// Simple, direct implementation of the Möller–Trumbore intersection algorithm.
fn intersectTriangle(triangle: Triangle, ray: Ray) -> IntersectionResult {
  let v0 = triangle.v0;
  let v1 = triangle.v1;
  let v2 = triangle.v2;

  let v0v1 = v1 - v0;
  let v0v2 = v2 - v0;
  let pvec = cross(ray.direction, v0v2);
  
  let det = dot(v0v1, pvec);

  const CULLING = false;

  if (CULLING) {
    if (det < 0.000001) {
      return IntersectionResult(false, 0, vec3f(0));
    }
  } else {
    if (abs(det) < 0.000001) {
      return IntersectionResult(false, 0, vec3f(0));
    }
  }

  let invDet = 1.0 / det;
  let tvec = ray.origin - v0;
  let u = dot(tvec, pvec) * invDet;

  if (u < 0 || u > 1) {
    return IntersectionResult(false, 0, vec3f(0));
  }

  let qvec = cross(tvec, v0v1);
  let v = dot(ray.direction, qvec) * invDet;

  if (v < 0 || u + v > 1) {
    return IntersectionResult(false, 0, vec3f(0));
  }

  let t = dot(v0v2, qvec) * invDet;
  let hitPoint = ray.origin + t * ray.direction;
  
  return IntersectionResult(true, t, hitPoint);
}
`;
