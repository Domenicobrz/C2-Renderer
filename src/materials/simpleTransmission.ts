import { Vector3 } from "three";
import { PrimitiveIntersection } from "../geometry/intersection";
import { Ray } from "../geometry/ray";
import { Material } from "./materials";

export class SimpleTransmission extends Material {
    constructor(
        public color : Vector3,
        public refractionIndex : number,
    ) { 
        super();
    }

    private refract(v : Vector3, n : Vector3, ni_over_nt : number, refracted : Vector3) : boolean {
        let uv = v.clone().normalize();
        let dt = uv.dot(n);
        let discriminant = 1.0 - ni_over_nt * ni_over_nt * (1.0 - dt*dt);
        if (discriminant > 0.0) {
            // ni_over_nt * (v - n * dt) - n * sqrt(discriminant);

            // ni_over_nt * (v - n * dt)
            let t1 = v.clone().addScaledVector(n, -dt).multiplyScalar(ni_over_nt);
            // n * sqrt(discriminant)
            let t2 = n.clone().multiplyScalar(Math.sqrt(discriminant));
            t1.sub(t2);

            refracted.copy(t1);
            return true;
        }
    
        return false;
    }

    scatter(pi : PrimitiveIntersection, ray : Ray, mult: Vector3) : void {

        let normal = pi.normal;
        let refractionIndex = this.refractionIndex;
                    
        let outward_normal : Vector3;

        let reflected = ray.direction.clone().reflect(normal);

        let ni_over_nt : number;
        let refracted = new Vector3(0,0,0);

        let reflect_prob : number;
        let cosine : number;
        
        let viewDir = ray.direction.clone().multiplyScalar(-1);

        if (viewDir.dot(normal) > 0.0) {
            outward_normal = normal;
            // outward_normal = normal.clone().multiplyScalar(-1);
            ni_over_nt = 1.0 / refractionIndex;
            // ni_over_nt = refractionIndex;
            cosine = refractionIndex * viewDir.dot(normal);
        } else {
            outward_normal = normal.clone().multiplyScalar(-1);
            // outward_normal = normal;
            ni_over_nt = refractionIndex;
            // ni_over_nt = 1.0 / refractionIndex;
            cosine = - viewDir.dot(normal);
        }

        if (this.refract(ray.direction, outward_normal, ni_over_nt, refracted)) {
            let r0 = (1.0 - refractionIndex) / (1.0 + refractionIndex);
            r0 *= r0;
            reflect_prob = r0 + (1.0 - r0) * Math.pow((1.0 - cosine), 5.0);
        } else {
            reflect_prob = 1.0;
        }


        mult.multiply(this.color);
        

        if(Math.random() < reflect_prob) {
            // reflect
            let newRayOrigin = pi.hitPoint.clone().addScaledVector(normal, 0.0001);
            ray.origin.copy(newRayOrigin);
            ray.direction.copy(reflected);
        } else {
            // refract
            let newRayOrigin = pi.hitPoint.clone().addScaledVector(outward_normal.clone().multiplyScalar(-1), 0.01);
            ray.origin.copy(newRayOrigin);
            ray.direction.copy(refracted);
        }
    }
}