import { Vector3 } from "three";
import { AABBIntersection } from "./intersection";
import { Ray } from "./ray";

export class AABB {
    constructor(
        public min : Vector3 = new Vector3(Infinity,Infinity,Infinity),
        public max : Vector3 = new Vector3(-Infinity,-Infinity,-Infinity),
    ) { }
        
    expand(param : Vector3) : void;
    expand(param : AABB) : void;
    expand(param : AABB | Vector3) : void {
        if(param instanceof Vector3) {
            if(param.x < this.min.x) this.min.setX(param.x);
            if(param.y < this.min.y) this.min.setY(param.y);
            if(param.z < this.min.z) this.min.setZ(param.z);
            if(param.x > this.max.x) this.max.setX(param.x);
            if(param.y > this.max.y) this.max.setY(param.y);
            if(param.z > this.max.z) this.max.setZ(param.z);
        } else if (param instanceof AABB) {
            if(param.min.x < this.min.x) this.min.setX(param.min.x);
            if(param.min.y < this.min.y) this.min.setY(param.min.y);
            if(param.min.z < this.min.z) this.min.setZ(param.min.z);
            if(param.max.x > this.max.x) this.max.setX(param.max.x);
            if(param.max.y > this.max.y) this.max.setY(param.max.y);
            if(param.max.z > this.max.z) this.max.setZ(param.max.z);
        }
    }

    intersect(ray : Ray) : AABBIntersection {
        let dirfrac = new Vector3(1,1,1).divide(ray.direction);

        // this.min is the corner of AABB with minimal coordinates - left bottom, this.max is maximal corner
        // r.org is origin of ray
        let t1 = (this.min.x - ray.origin.x) * dirfrac.x;
        let t2 = (this.max.x - ray.origin.x) * dirfrac.x;
        let t3 = (this.min.y - ray.origin.y) * dirfrac.y;
        let t4 = (this.max.y - ray.origin.y) * dirfrac.y;
        let t5 = (this.min.z - ray.origin.z) * dirfrac.z;
        let t6 = (this.max.z - ray.origin.z) * dirfrac.z;

        let tmin = Math.max(Math.max(Math.min(t1, t2), Math.min(t3, t4)), Math.min(t5, t6));
        let tmax = Math.min(Math.min(Math.max(t1, t2), Math.max(t3, t4)), Math.max(t5, t6));

        // if tmax < 0, ray (line) is intersecting AABB, but the whole AABB is behind us
        if (tmax < 0) {
            return new AABBIntersection(tmax, false);
        }

        // if tmin > tmax, ray doesn't intersect AABB
        if (tmin > tmax) {
            return new AABBIntersection(tmax, false);
        }

        // necessary to avoid issue 1. on docs/images
        if(tmin < 0) tmin = 0;

        return new AABBIntersection(tmin, true);
    }
}