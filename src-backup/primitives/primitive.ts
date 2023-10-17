import { Vector3 } from "three";
import { AABB } from "../geometry/aabb";
import { PrimitiveIntersection } from "../geometry/intersection";
import { Ray } from "../geometry/ray";

export abstract class Primitive {
    constructor(
        public materialIndex : number,
    ) { }

    getAABB() : AABB {
        return new AABB();
    }

    getCentroid() : Vector3 {
        return new Vector3(0,0,0);
    }

    intersect(ray : Ray) : PrimitiveIntersection {
        return new PrimitiveIntersection();
    }
}