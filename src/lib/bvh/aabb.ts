import { Vector3 } from 'three';

export class AABB {
  constructor(
    public min: Vector3 = new Vector3(Infinity, Infinity, Infinity),
    public max: Vector3 = new Vector3(-Infinity, -Infinity, -Infinity)
  ) {}

  expand(param: Vector3): void;
  expand(param: AABB): void;
  expand(param: AABB | Vector3): void {
    if (param instanceof Vector3) {
      if (param.x < this.min.x) this.min.setX(param.x);
      if (param.y < this.min.y) this.min.setY(param.y);
      if (param.z < this.min.z) this.min.setZ(param.z);
      if (param.x > this.max.x) this.max.setX(param.x);
      if (param.y > this.max.y) this.max.setY(param.y);
      if (param.z > this.max.z) this.max.setZ(param.z);
    } else if (param instanceof AABB) {
      if (param.min.x < this.min.x) this.min.setX(param.min.x);
      if (param.min.y < this.min.y) this.min.setY(param.min.y);
      if (param.min.z < this.min.z) this.min.setZ(param.min.z);
      if (param.max.x > this.max.x) this.max.setX(param.max.x);
      if (param.max.y > this.max.y) this.max.setY(param.max.y);
      if (param.max.z > this.max.z) this.max.setZ(param.max.z);
    }
  }

  static shaderStruct() {
    return /* wgsl */ `
      struct AABB {
        min: vec3f,
        max: vec3f,
      }

      struct AABBIntersectionResult {
        t: f32,
        hit: bool,
      }
    `;
  }

  static shaderIntersect() {
    return /* wgsl */ `
      fn aabbIntersect(ro: vec3f, rd: vec3f, aabb: AABB) -> AABBIntersectionResult {
        let dirfrac = vec3f(1,1,1) / rd;

        // this.min is the corner of AABB with minimal coordinates - left bottom, this.max is maximal corner
        // r.org is origin of ray
        let t1 = (aabb.min.x - ro.x) * dirfrac.x;
        let t2 = (aabb.max.x - ro.x) * dirfrac.x;
        let t3 = (aabb.min.y - ro.y) * dirfrac.y;
        let t4 = (aabb.max.y - ro.y) * dirfrac.y;
        let t5 = (aabb.min.z - ro.z) * dirfrac.z;
        let t6 = (aabb.max.z - ro.z) * dirfrac.z;


        var tmin = max(max(min(t1, t2), min(t3, t4)), min(t5, t6));
        let tmax = min(min(max(t1, t2), max(t3, t4)), max(t5, t6));

        // if tmax < 0, ray (line) is intersecting AABB, but the whole AABB is behind us
        if (tmax < 0) {
          return AABBIntersectionResult(tmax, false);
        }

        // if tmin > tmax, ray doesn't intersect AABB
        if (tmin > tmax) {
          return AABBIntersectionResult(tmax, false);
        }

        // necessary to avoid issue 1. on docs/images
        if (tmin < 0) { 
          tmin = 0;
        }

        return AABBIntersectionResult(tmin, true);
      }
    `;
  }
}
