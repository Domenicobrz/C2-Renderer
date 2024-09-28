import { AABB } from '$lib/bvh/aabb';
import { Emissive } from '$lib/materials/emissive';
import type { Material } from '$lib/materials/material';
import { getLuminance } from '$lib/utils/getLuminance';
import { vec3 } from '$lib/utils/math';
import { Vector2, Vector3 } from 'three';

export class Triangle {
  public idxRef: number = -1;
  public normal: Vector3;
  public uv0: Vector2 = new Vector2(-1, -1);
  public uv1: Vector2 = new Vector2(-1, -1);
  public uv2: Vector2 = new Vector2(-1, -1);

  constructor(
    public v0: Vector3,
    public v1: Vector3,
    public v2: Vector3,
    public materialIndex: number,
    normal?: Vector3,
    uv0?: Vector2,
    uv1?: Vector2,
    uv2?: Vector2
  ) {
    if (normal) {
      this.normal = normal;
    } else {
      let v1v0 = v1.clone().sub(v0);
      let v2v0 = v2.clone().sub(v0);
      this.normal = v1v0.cross(v2v0).normalize();
    }

    if (uv0) this.uv0 = uv0;
    if (uv1) this.uv1 = uv1;
    if (uv2) this.uv2 = uv2;
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

  getUvArea(): number {
    let uv1uv0 = vec3(this.uv1.x - this.uv0.x, this.uv1.y - this.uv0.y, 0);
    let uv2uv0 = vec3(this.uv2.x - this.uv0.x, this.uv2.y - this.uv0.y, 0);
    return uv1uv0.cross(uv2uv0).length() * 0.5;
  }

  getCentroid(): Vector3 {
    return this.v0.clone().add(this.v1).add(this.v2).divideScalar(3);
  }

  getLuminance(material: Material): number {
    if (!(material instanceof Emissive))
      throw new Error("can't get luminance of non-emissive material");

    let t =
      getLuminance(new Vector3(material.color.r, material.color.g, material.color.b)) *
      material.intensity;
    return t * this.getArea();
  }

  // https://github.com/johnnovak/raytriangle-test
  // Simple, direct implementation of the Möller–Trumbore intersection algorithm.
  intersectRay(ro: Vector3, rd: Vector3): { hit: boolean; t: number; hitPoint: Vector3 } {
    let v0 = this.v0;
    let v1 = this.v1;
    let v2 = this.v2;

    let v0v1 = v1.clone().sub(v0);
    let v0v2 = v2.clone().sub(v0);
    let pvec = rd.clone().cross(v0v2);

    let det = v0v1.dot(pvec);

    const CULLING = false;

    if (CULLING) {
      if (det < 0.000001) {
        return { hit: false, t: 0, hitPoint: new Vector3(0, 0, 0) };
      }
    } else {
      if (Math.abs(det) < 0.000001) {
        return { hit: false, t: 0, hitPoint: new Vector3(0, 0, 0) };
      }
    }

    let invDet = 1.0 / det;
    let tvec = ro.clone().sub(v0);
    let u = tvec.dot(pvec) * invDet;

    if (u < 0 || u > 1) {
      return { hit: false, t: 0, hitPoint: new Vector3(0, 0, 0) };
    }

    let qvec = tvec.clone().cross(v0v1);
    let v = rd.dot(qvec) * invDet;

    if (v < 0 || u + v > 1) {
      return { hit: false, t: 0, hitPoint: new Vector3(0, 0, 0) };
    }

    let t = v0v2.dot(qvec) * invDet;

    if (t < 0) {
      return { hit: false, t: 0, hitPoint: new Vector3(0, 0, 0) };
    }

    let hitPoint = ro.clone().add(rd.clone().multiplyScalar(t));

    return { hit: true, t, hitPoint };
  }

  static getBufferData(triangles: Triangle[], materialOffsetsByIndex: number[]) {
    const STRUCT_SIZE = 96; /* determined with offset computer */
    const trianglesCount = triangles.length;
    const data = new ArrayBuffer(STRUCT_SIZE * trianglesCount);

    // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001008401000000000000003d888b0237284d3025f2381bcb288abe3eafc62d6ca0d8042fc1971a88f51b3ff18869efcbe1877af43e5e4fd0b7625f6439325a1f16083a6b0a7bb0996446ac9a036e2faff7f3dc83b7312639a457959688af3cfba5180e2e8a030b88bbda0c78bcfe6fa57d75b4c893b02933da320fbaef2d5f6287f13c6f34fbe4feb439d47a0c35be7484bf17ff57b7182f4c8e1881a36e6a9d9ef929ad3b889a0faf52bc96fc39279ccd1b68f0265879282f7f13a6ca93520b28e6671acbcf0bc905b4659207572b37b3963a352617092b936bd52647d847b02d993b024e20fe1a8393
    triangles.forEach((t, i) => {
      const offs = i * STRUCT_SIZE;
      const views = {
        v0: new Float32Array(data, offs + 0, 3),
        v1: new Float32Array(data, offs + 16, 3),
        v2: new Float32Array(data, offs + 32, 3),
        uv0: new Float32Array(data, offs + 48, 2),
        uv1: new Float32Array(data, offs + 56, 2),
        uv2: new Float32Array(data, offs + 64, 2),
        area: new Float32Array(data, offs + 72, 1),
        uvArea: new Float32Array(data, offs + 76, 1),
        normal: new Float32Array(data, offs + 80, 3),
        materialOffset: new Uint32Array(data, offs + 92, 1)
      };
      views.v0.set([t.v0.x, t.v0.y, t.v0.z]);
      views.v1.set([t.v1.x, t.v1.y, t.v1.z]);
      views.v2.set([t.v2.x, t.v2.y, t.v2.z]);
      views.uv0.set([t.uv0.x, t.uv0.y]);
      views.uv1.set([t.uv1.x, t.uv1.y]);
      views.uv2.set([t.uv2.x, t.uv2.y]);
      views.area.set([t.getArea()]);
      views.uvArea.set([t.getUvArea()]);
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
        uv: vec2f,
      }

      // this layout saves some bytes because of padding
      // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001005701000000000000003d888b0237284d3025f2381bcb288abe3eafc62d6ca0d8042fc1971a88f51b3ff18869efcbe1877af43e5e4fd034ee05413b60296cdbdb3f53c78732caefece359691688a4e1b5274b5eed2696616a5993f7f3cbfb658410256f1f8a8688c290394a0e04baa72430c844d7c42eb7972f194a3ff475706727d9dd7cd6d29ccf80e1d4cef6b4719471ff7b8e5b5a3bf063d4d410af49db02464f4b6279c4d5112a9668ee9f175584fe719e3c5e79a4b3f53369df6c0ea12038c4d6a435d3224ce7bd7be81501de7e9834f18ece64a6432e13fe554bc6
      struct Triangle {
        v0: vec3f,
        v1: vec3f,
        v2: vec3f,
        uv0: vec2f,
        uv1: vec2f,
        uv2: vec2f,
        area: f32,
        uvArea: f32,
        normal: vec3f,
        materialOffset: u32,
      }
    `;
  }

  static shaderIntersectionFn(): string {
    return /* wgsl */ `
      fn sampleTrianglePoint(triangle: Triangle, s: f32, t: f32) -> vec3f {
        let v0v1 = (triangle.v1 - triangle.v0);
        let v0v2 = (triangle.v2 - triangle.v0);
        let in_triangle = s + t <= 1;

        if (in_triangle) {
          return v0v1 * s + v0v2 * t + triangle.v0;
        }

        return v0v1 * (1.0 - s) + v0v2 * (1.0 - t) + triangle.v0;
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
            return IntersectionResult(false, 0, vec3f(0), vec2f(0));
          }
        } else {
          if (abs(det) < 0.000001) {
            return IntersectionResult(false, 0, vec3f(0), vec2f(0));
          }
        }
      
        let invDet = 1.0 / det;
        let tvec = ray.origin - v0;
        let u = dot(tvec, pvec) * invDet;
      
        if (u < 0 || u > 1) {
          return IntersectionResult(false, 0, vec3f(0), vec2f(0));
        }
      
        let qvec = cross(tvec, v0v1);
        let v = dot(ray.direction, qvec) * invDet;
      
        if (v < 0 || u + v > 1) {
          return IntersectionResult(false, 0, vec3f(0), vec2f(0));
        }
      
        let t = dot(v0v2, qvec) * invDet;

        if (t < 0) {
          return IntersectionResult(false, 0, vec3f(0), vec2f(0));
        }

        let hitPoint = ray.origin + t * ray.direction;
        
        let w = 1.0 - u - v;
        let uv0 = triangle.uv0;
        let uv1 = triangle.uv1;
        let uv2 = triangle.uv2;
        let hitUV = uv0 * w + uv1 * u + uv2 * v;

        return IntersectionResult(true, t, hitPoint, hitUV);
      }

      fn intersectTriangleWithDerivativeRay(triangle: Triangle, ray: Ray) -> IntersectionResult {
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
            return IntersectionResult(false, 0, vec3f(0), vec2f(0));
          }
        } else {
          if (abs(det) < 0.000001) {
            return IntersectionResult(false, 0, vec3f(0), vec2f(0));
          }
        }
      
        let invDet = 1.0 / det;
        let tvec = ray.origin - v0;
        let u = dot(tvec, pvec) * invDet;
      
        // for derivative rays, we'll skip the u and v checks
        // if (u < 0 || u > 1) {
        //   return IntersectionResult(false, 0, vec3f(0), vec2f(0));
        // }
      
        let qvec = cross(tvec, v0v1);
        let v = dot(ray.direction, qvec) * invDet;
      
        // for derivative rays, we'll skip the u and v checks
        // if (v < 0 || u + v > 1) {
        //   return IntersectionResult(false, 0, vec3f(0), vec2f(0));
        // }
      
        let t = dot(v0v2, qvec) * invDet;

        if (t < 0) {
          return IntersectionResult(false, 0, vec3f(0), vec2f(0));
        }

        let hitPoint = ray.origin + t * ray.direction;
        
        let w = 1.0 - u - v;
        let uv0 = triangle.uv0;
        let uv1 = triangle.uv1;
        let uv2 = triangle.uv2;
        let hitUV = uv0 * w + uv1 * u + uv2 * v;

        return IntersectionResult(true, t, hitPoint, hitUV);
      }
    `;
  }
}
