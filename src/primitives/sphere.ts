import { Vector3 } from "three";
import { PrimitiveIntersection } from "../geometry/intersection";
import { Ray } from "../geometry/ray";
import { Primitive } from "./primitive";

export class Sphere extends Primitive {
    constructor(
        public center : Vector3,
        public radius : number,
        public materialIndex : number,
    ) { 
        super(materialIndex);
    }

    intersect(ray : Ray) : PrimitiveIntersection {
        let OC : Vector3 = new Vector3(0,0,0);
        OC.x = ray.origin.x - this.center.x;
        OC.y = ray.origin.y - this.center.y;
        OC.z = ray.origin.z - this.center.z;

        let a = ray.direction.dot(ray.direction);
        let b = ray.direction.dot(OC);
        let c = OC.dot(OC) - this.radius * this.radius;
        let delta = b * b - a * c;

        let result = new PrimitiveIntersection();

        if (delta < 0) // No solution
            return result;

        // One or two solutions, take the closest (positive) intersection
        let sqrtDelta = Math.sqrt(delta);

        // a >= 0
        let tMin = (-b - sqrtDelta) / a;
        let tMax = (-b + sqrtDelta) / a;

        if (tMax < 0) // All intersection points are behind the origin of the ray
            return result;

        let t = tMin >= 0 ? tMin : tMax;

        result.hitPoint.copy(ray.origin.clone().addScaledVector(ray.direction, t));
        result.intersected = true;
        result.normal = result.hitPoint.clone().sub(this.center).normalize();
        result.primitive = this;
        result.t = t;

        // I could theoretically compute phi & theta and use those to determine uvs
        // result.uvs = ?
    
        return result;
    }
}