import { Vector3 } from "three";
import { PrimitiveIntersection } from "../geometry/intersection";
import { Ray } from "../geometry/ray";
import { Material } from "./materials";

export class SimpleGlossy extends Material {
    constructor(
        public color : Vector3,
        public glossiness : number = 0.5,
    ) { 
        super();
    }

    scatter(pi : PrimitiveIntersection, ray : Ray, mult: Vector3) : void {
        let normal = pi.normal;
        let hitPoint = pi.hitPoint;
        let newRayOrigin = hitPoint.clone().addScaledVector(normal, 0.0001);
        
        let newRayDirection = ray.direction.reflect(normal);

        let randomDir = new Vector3(
            Math.random() * 2 - 1, 
            Math.random() * 2 - 1, 
            Math.random() * 2 - 1
        ).normalize().multiplyScalar(this.glossiness);

        newRayDirection = newRayOrigin.clone().add(newRayDirection).add(randomDir);
        newRayDirection.sub(newRayOrigin).normalize();

        mult.multiply(this.color);

        ray.origin.copy(newRayOrigin);
        ray.direction.copy(newRayDirection);
    }
}