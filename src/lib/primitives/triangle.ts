import { AABB } from '$lib/bvh/aabb';
import { Emissive } from '$lib/materials/emissive';
import type { Material } from '$lib/materials/material';
import type { Vector3 } from 'three';

export class Triangle {
  public idxRef: number = -1;
  public normal: Vector3;

  constructor(
    public v0: Vector3,
    public v1: Vector3,
    public v2: Vector3,
    public materialIndex: number,
    normal?: Vector3
  ) {
    if (normal) {
      this.normal = normal;
    } else {
      let v1v0 = v1.clone().sub(v0);
      let v2v0 = v2.clone().sub(v0);
      this.normal = v1v0.cross(v2v0).normalize();
    }
  }

  setIdxRef(idx: number) {
    this.idxRef = idx;
  }

  getAABB(): AABB {
    let aabb = new AABB();
    aabb.expand(this.v0);
    aabb.expand(this.v1);
    aabb.expand(this.v2);

    return aabb;
  }

  getArea(): number {
    let v1v0 = this.v1.clone().sub(this.v0);
    let v2v0 = this.v2.clone().sub(this.v0);
    return v1v0.cross(v2v0).length() * 0.5;
  }

  getCentroid(): Vector3 {
    return this.v0.clone().add(this.v1).add(this.v2).divideScalar(3);
  }

  getLuminance(material: Material): number {
    if (!(material instanceof Emissive))
      throw new Error("can't get luminance of non-emissive material");

    let t = (material.color.r + material.color.g + material.color.b) * material.intensity;
    return t * this.getArea();
  }

  static getBufferData(triangles: Triangle[], materialOffsetsByIndex: number[]) {
    const STRUCT_SIZE = 64; /* determined with offset computer */
    const trianglesCount = triangles.length;
    const data = new ArrayBuffer(STRUCT_SIZE * trianglesCount);

    // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001005701000000000000003d888b0237284d3025f2381bcb288abe3eafc62d6ca0d8042fc1971a88f51b3ff18869efcbe1877af43e5e4fd034ee05413b60296cdbdb3f53c78732caefece359691688a4e1b5274b5eed2696616a5993f7f3cbfb658410256f1f8a8688c290394a0e04baa72430c844d7c42eb7972f194a3ff475706727d9dd7cd6d29ccf80e1d4cef6b4719471ff7b8e5b5a3bf063d4d410af49db02464f4b6279c4d5112a9668ee9f175584fe719e3c5e79a4b3f53369df6c0ea12038c4d6a435d3224ce7bd7be81501de7e9834f18ece64a6432e13fe554bc6
    triangles.forEach((t, i) => {
      const offs = i * STRUCT_SIZE;
      const views = {
        v0: new Float32Array(data, offs + 0, 3),
        v1: new Float32Array(data, offs + 16, 3),
        v2: new Float32Array(data, offs + 32, 3),
        area: new Float32Array(data, offs + 44, 1),
        normal: new Float32Array(data, offs + 48, 3),
        materialOffset: new Uint32Array(data, offs + 60, 1)
      };
      views.v0.set([t.v0.x, t.v0.y, t.v0.z]);
      views.v1.set([t.v1.x, t.v1.y, t.v1.z]);
      views.v2.set([t.v2.x, t.v2.y, t.v2.z]);
      views.area.set([t.getArea()]);
      views.normal.set([t.normal.x, t.normal.y, t.normal.z]);
      views.materialOffset.set([materialOffsetsByIndex[t.materialIndex]]);
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
      // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001005701000000000000003d888b0237284d3025f2381bcb288abe3eafc62d6ca0d8042fc1971a88f51b3ff18869efcbe1877af43e5e4fd034ee05413b60296cdbdb3f53c78732caefece359691688a4e1b5274b5eed2696616a5993f7f3cbfb658410256f1f8a8688c290394a0e04baa72430c844d7c42eb7972f194a3ff475706727d9dd7cd6d29ccf80e1d4cef6b4719471ff7b8e5b5a3bf063d4d410af49db02464f4b6279c4d5112a9668ee9f175584fe719e3c5e79a4b3f53369df6c0ea12038c4d6a435d3224ce7bd7be81501de7e9834f18ece64a6432e13fe554bc6
      struct Triangle {
        v0: vec3f,
        v1: vec3f,
        v2: vec3f,
        area: f32,
        normal: vec3f,
        materialOffset: u32,
      }
    `;
  }

  static shaderIntersectionFn(): string {
    return /* wgsl */ `
      fn sampleTrianglePoint(triangle: Triangle, s: f32, t: f32) -> vec3f {
        let v0v1 = triangle.v1 - triangle.v0;
        let v0v2 = triangle.v2 - triangle.v0;
        let in_triangle = s + t <= 1;

        if (in_triangle) {
          return v0v1 * s + v0v2 * t;
        }

        return v0v1 * (1.0 - s) + v0v2 * (1.0 - t);
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

        if (t < 0) {
          return IntersectionResult(false, 0, vec3f(0));
        }

        let hitPoint = ray.origin + t * ray.direction;

        return IntersectionResult(true, t, hitPoint);
      }
    `;
  }
}
