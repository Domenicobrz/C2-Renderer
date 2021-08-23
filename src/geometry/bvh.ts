import { Primitive } from "../primitives/primitive";
import { PrimitiveIntersection } from "./intersection";
import { Ray } from "./ray";

export class BVH {
    constructor(
        public primitives : Primitive[]
    ) { }

    intersect(ray : Ray) : PrimitiveIntersection {
        return new PrimitiveIntersection();
    }
}