import { Vector3 } from "three";

export class Ray {
    constructor(
        public origin: Vector3, 
        public direction: Vector3) { }
}