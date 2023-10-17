import { Vector2, Vector3 } from "three";
import { Primitive } from "../primitives/primitive";

export class PrimitiveIntersection {
    constructor(
        public intersected : boolean   = false,
        public t           : number    = Infinity,
        public hitPoint    : Vector3   = new Vector3(0,0,0),
        public normal      : Vector3   = new Vector3(0,0,0),
        public uvs         : Vector2   = new Vector2(0,0),
        public primitive   : Primitive = null, /* <-- theoretically this should be wrong from an architectural perspective */
    ) { }
}

export class AABBIntersection {
    constructor(
        public t   : number  = Infinity,
        public hit : boolean = false,
    ) { }
}