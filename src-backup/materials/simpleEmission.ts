import { Vector3 } from "three";
import { PrimitiveIntersection } from "../geometry/intersection";
import { Ray } from "../geometry/ray";
import { Material } from "./materials";

export class SimpleEmission extends Material {
    constructor(
        public emission : Vector3,
    ) { 
        super();
    }

    getEmission(pi : PrimitiveIntersection, ray : Ray) : Vector3 {
        return this.emission;
    }

    scatter(pi : PrimitiveIntersection, ray : Ray, mult: Vector3) : void {
        let normal = pi.normal;
        if(ray.direction.dot(normal) > 0) {
            normal = normal.clone().negate();
        }

        let hitPoint = pi.hitPoint;
        let newRayOrigin = hitPoint.clone().addScaledVector(normal, 0.0001);
        
        let newRayDirection = new Vector3(
          Math.random() * 2 - 1, 
          Math.random() * 2 - 1, 
          Math.random() * 2 - 1
        ).normalize();

        newRayDirection = newRayOrigin.clone().add(normal).add(newRayDirection);
        newRayDirection.sub(newRayOrigin).normalize();

        // mult.multiply(this.color);
        mult.multiplyScalar(newRayDirection.dot(normal));

        ray.origin.copy(newRayOrigin);
        ray.direction.copy(newRayDirection);
    }
}