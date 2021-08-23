import { Vector3 } from "three";

export class AABB {
    constructor(
        public min : Vector3,
        public max : Vector3,
    ) { }
}