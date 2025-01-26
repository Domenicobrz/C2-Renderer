import { AABB } from '$lib/bvh/aabb';
import { Emissive } from '$lib/materials/emissive';
import type { Material } from '$lib/materials/material';
import { getLuminance } from '$lib/utils/getLuminance';
import { getTangent } from '$lib/utils/calculateTangents';
import { vec3 } from '$lib/utils/math';
import { Vector2, Vector3 } from 'three';

export class Triangle {
  public idxRef: number = -1;
  public norm0: Vector3;
  public norm1: Vector3;
  public norm2: Vector3;
  public geometricNormal: Vector3;
  public uv0: Vector2 = new Vector2(-1, -1);
  public uv1: Vector2 = new Vector2(-1, -1);
  public uv2: Vector2 = new Vector2(-1, -1);
  public tang0: Vector3 = new Vector3(-1, -1);
  public tang1: Vector3 = new Vector3(-1, -1);
  public tang2: Vector3 = new Vector3(-1, -1);
  public lightSourcePickProb: number = 0;

  constructor(
    public v0: Vector3,
    public v1: Vector3,
    public v2: Vector3,
    public materialIndex: number,
    norm0?: Vector3,
    norm1?: Vector3,
    norm2?: Vector3,
    uv0?: Vector2,
    uv1?: Vector2,
    uv2?: Vector2,
    tang0?: Vector3,
    tang1?: Vector3,
    tang2?: Vector3,
    matrixDeterminant?: number
  ) {
    let v1v0 = v1.clone().sub(v0);
    let v2v0 = v2.clone().sub(v0);
    this.geometricNormal = v1v0.cross(v2v0).normalize();

    // some transformation matrices like
    // scale (-1,1,1) can flip the handedness of the
    // cross product used to calculate the geometric
    // normal, in that case the determinant will be negative
    // and it'll signal that we have to negate the
    // resulting normal to keep it consistent
    if (matrixDeterminant != undefined && matrixDeterminant < 0) {
      this.geometricNormal.negate();
    }

    if (norm0 && norm1 && norm2) {
      this.norm0 = norm0;
      this.norm1 = norm1;
      this.norm2 = norm2;
    } else {
      this.norm0 = this.geometricNormal;
      this.norm1 = this.geometricNormal;
      this.norm2 = this.geometricNormal;
    }

    if (uv0) this.uv0 = uv0;
    if (uv1) this.uv1 = uv1;
    if (uv2) this.uv2 = uv2;

    if (tang0) this.tang0 = tang0;
    if (tang1) this.tang1 = tang1;
    if (tang2) this.tang2 = tang2;

    if (!tang0) {
      this.computeTangents();
    }
  }

  computeTangents() {
    let t = this;
    let tangent = getTangent(t.v0, t.v1, t.v2, t.uv0, t.uv1, t.uv2);

    this.tang0 = tangent;
    this.tang1 = tangent;
    this.tang2 = tangent;
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

    let t =
      getLuminance(new Vector3(material.color.r, material.color.g, material.color.b)) *
      material.intensity;

    return t * this.getArea();
  }

  setLightSourcePickProb(value: number) {
    this.lightSourcePickProb = value;
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
    const STRUCT_SIZE = 192; /* determined with offset computer */
    const trianglesCount = triangles.length;
    const data = new ArrayBuffer(STRUCT_SIZE * trianglesCount);

    // this layout saves some bytes thanks to better padding utilization
    // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001008402000000000000003d888b0237284d3025f2381bcb288abe3eafc62d6ca0d8042fc198313b2c59144a61358b4ecf0a110a5742e9967abe5fd8f09cb0d426b783c5c4acdcaff73de043847ea99d270287c5bb8165ff191938bf46519812ae7414abd50009897e6e082bbcee17c3349015d5ed4b8b2120008b0c6a6ffc569819fa7a27183a01ea0a2473a3d9ae82d6f19977f864f8389ad8d0166b9039cdef56ea0156ff4d5fb5245315b532da1a7b3c81364f31ab5bcb14150cb20619751943f1d96182f45c3e5ddca7cecc01374fbdf4d94965aa085462ebf20563ad9553c901c0e6890cfd7cbf4392bca3fff587ff59069e7aa71bb4a9dcb6881df21a53d876fecbd759c1c11611742171b1bac66e8bb0442f7f251de34876f234ac2fc555fff63d7861
    triangles.forEach((t, i) => {
      const offs = i * STRUCT_SIZE;
      const views = {
        v0: new Float32Array(data, offs + 0, 3),
        v1: new Float32Array(data, offs + 16, 3),
        v2: new Float32Array(data, offs + 32, 3),
        uv0: new Float32Array(data, offs + 48, 2),
        uv1: new Float32Array(data, offs + 56, 2),
        uv2: new Float32Array(data, offs + 64, 2),
        tang0: new Float32Array(data, offs + 80, 3),
        tang1: new Float32Array(data, offs + 96, 3),
        tang2: new Float32Array(data, offs + 112, 3),
        area: new Float32Array(data, offs + 124, 1),
        norm0: new Float32Array(data, offs + 128, 3),
        norm1: new Float32Array(data, offs + 144, 3),
        norm2: new Float32Array(data, offs + 160, 3),
        lightSourcePickProb: new Float32Array(data, offs + 172, 1),
        geometricNormal: new Float32Array(data, offs + 176, 3),
        materialOffset: new Uint32Array(data, offs + 188, 1)
      };
      views.v0.set([t.v0.x, t.v0.y, t.v0.z]);
      views.v1.set([t.v1.x, t.v1.y, t.v1.z]);
      views.v2.set([t.v2.x, t.v2.y, t.v2.z]);
      views.uv0.set([t.uv0.x, t.uv0.y]);
      views.uv1.set([t.uv1.x, t.uv1.y]);
      views.uv2.set([t.uv2.x, t.uv2.y]);
      views.area.set([t.getArea()]);
      views.lightSourcePickProb.set([t.lightSourcePickProb]);
      views.norm0.set([t.norm0.x, t.norm0.y, t.norm0.z]);
      views.norm1.set([t.norm1.x, t.norm1.y, t.norm1.z]);
      views.norm2.set([t.norm2.x, t.norm2.y, t.norm2.z]);
      views.tang0.set([t.tang0.x, t.tang0.y, t.tang0.z]);
      views.tang1.set([t.tang1.x, t.tang1.y, t.tang1.z]);
      views.tang2.set([t.tang2.x, t.tang2.y, t.tang2.z]);
      views.geometricNormal.set([t.geometricNormal.x, t.geometricNormal.y, t.geometricNormal.z]);
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
        normal: vec3f,
        tangent: vec3f,
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
        tang0: vec3f,
        tang1: vec3f,
        tang2: vec3f,
        area: f32,
        norm0: vec3f,
        norm1: vec3f,
        norm2: vec3f,
        lightSourcePickProb: f32,
        geometricNormal: vec3f,
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
        const noIntersection = IntersectionResult(false, 0, vec3f(0), vec2f(0), vec3f(0), vec3(0));
      
        if (CULLING) {
          if (det < 0.000001) {
            return noIntersection;
          }
        } else {
          if (abs(det) < 0.000001) {
            return noIntersection;
          }
        }
      
        let invDet = 1.0 / det;
        let tvec = ray.origin - v0;
        let u = dot(tvec, pvec) * invDet;
      
        if (u < 0 || u > 1) {
          return noIntersection;
        }
      
        let qvec = cross(tvec, v0v1);
        let v = dot(ray.direction, qvec) * invDet;
      
        if (v < 0 || u + v > 1) {
          return noIntersection;
        }
      
        let t = dot(v0v2, qvec) * invDet;

        if (t < 0) {
          return noIntersection;
        }

        let hitPoint = ray.origin + t * ray.direction;
        
        let w = 1.0 - u - v;
        let uv0 = triangle.uv0;
        let uv1 = triangle.uv1;
        let uv2 = triangle.uv2;
        let hitUV = uv0 * w + uv1 * u + uv2 * v;
        
        let norm0 = triangle.norm0;
        let norm1 = triangle.norm1;
        let norm2 = triangle.norm2;
        let hitNormal = normalize(norm0 * w + norm1 * u + norm2 * v);

        let tang0 = triangle.tang0;
        let tang1 = triangle.tang1;
        let tang2 = triangle.tang2;
        let hitTangent = normalize(tang0 * w + tang1 * u + tang2 * v);

        return IntersectionResult(true, t, hitPoint, hitUV, hitNormal, hitTangent);
      }
    `;
  }
}
