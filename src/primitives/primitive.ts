import { PrimitiveIntersection } from "../geometry/intersection";
import { Ray } from "../geometry/ray";

export abstract class Primitive {
    constructor(
        public materialIndex : number,
    ) { }

    intersect(ray : Ray) : PrimitiveIntersection {
        return new PrimitiveIntersection();
    }
}