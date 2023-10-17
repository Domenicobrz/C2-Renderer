import { Vector3 } from "three";
import { PrimitiveIntersection } from "../geometry/intersection";
import { Ray } from "../geometry/ray";

export enum Materials {
    SimpleLambert = 0,
    SimpleMirror  = 1,
    SimpleGlossy  = 2,
    SimpleTransmission = 3,
    SimpleEmission = 4,
}

export class Material {
    scatter(pi : PrimitiveIntersection, ray : Ray, mult: Vector3) : void { }
    getEmission(pi : PrimitiveIntersection, ray : Ray) : Vector3 { return new Vector3(0,0,0); }
}