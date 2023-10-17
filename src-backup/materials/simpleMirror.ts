import { Vector3 } from "three";
import { PrimitiveIntersection } from "../geometry/intersection";
import { Ray } from "../geometry/ray";
import { Material } from "./materials";

export class SimpleMirror extends Material {
    constructor(
        public color : Vector3,
    ) { 
        super();
    }

    scatter(pi : PrimitiveIntersection, ray : Ray, mult: Vector3) : void {
        let normal = pi.normal;
        if(ray.direction.dot(normal) > 0) {
            normal = normal.clone().negate();
        }
        
        let hitPoint = pi.hitPoint;
        let newRayOrigin = hitPoint.clone().addScaledVector(normal, 0.0001);
        
        let newRayDirection = ray.direction.reflect(normal);

        mult.multiply(this.color);

        ray.origin.copy(newRayOrigin);
        ray.direction.copy(newRayDirection);
    }
}