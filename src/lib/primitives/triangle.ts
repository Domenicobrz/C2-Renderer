import { AABB } from '$lib/bvh/aabb';
import type { Vector3 } from 'three';

export class Triangle {
  constructor(
    public v0: Vector3,
    public v1: Vector3,
    public v2: Vector3,
    public normal: Vector3,
    public materialOffset: number
  ) {}

  getAABB(): AABB {
    let aabb = new AABB();
    aabb.expand(this.v0);
    aabb.expand(this.v1);
    aabb.expand(this.v2);

    return aabb;
  }

  getCentroid(): Vector3 {
    return this.v0.clone().add(this.v1).add(this.v2).divideScalar(3);
  }

  static getBufferData(triangles: Triangle[]) {
    const STRUCT_SIZE = 64; /* determined with offset computer */
    const trianglesCount = triangles.length;
    const data = new ArrayBuffer(STRUCT_SIZE * trianglesCount);

    triangles.forEach((t, i) => {
      const offs = i * STRUCT_SIZE;
      const views = {
        v0: new Float32Array(data, offs + 0, 3),
        v1: new Float32Array(data, offs + 16, 3),
        v2: new Float32Array(data, offs + 32, 3),
        normal: new Float32Array(data, offs + 48, 3),
        materialOffset: new Uint32Array(data, offs + 60, 1)
      };
      views.v0.set([t.v0.x, t.v0.y, t.v0.z]);
      views.v1.set([t.v1.x, t.v1.y, t.v1.z]);
      views.v2.set([t.v2.x, t.v2.y, t.v2.z]);
      views.normal.set([t.normal.x, t.normal.y, t.normal.z]);
      views.materialOffset.set([t.materialOffset]);
    });

    return { trianglesBufferData: data, trianglesBufferDataByteSize: trianglesCount * STRUCT_SIZE };
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct IntersectionResult {
        hit: bool,
        t: f32,
        hitPoint: vec3f,
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
    `;
  }

  static shaderIntersectionFn(): string {
    return /* wgsl */ `
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
  }
}
