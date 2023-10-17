import { Vector2, Vector3 } from "three";
import { AABB } from "../geometry/aabb";
import { PrimitiveIntersection } from "../geometry/intersection";
import { Ray } from "../geometry/ray";
import { Primitive } from "./primitive";

export class Triangle extends Primitive {
    private v0v1: Vector3;
    private v0v2: Vector3;
    private N: Vector3;
    private area: number;
    private d: number;
    private v2subv1: Vector3;
    private v0subv2: Vector3;

    public normal: Vector3;

    constructor(
        public v0: Vector3,
        public v1: Vector3,
        public v2: Vector3,
        public materialIndex: number,
    ) {
        super(materialIndex);

        this.v0v1 = v1.clone().sub(v0);
        this.v0v2 = v2.clone().sub(v0);
        this.N = this.v0v1.clone().cross(this.v0v2);
        this.area = this.N.length();
        this.d = this.N.dot(this.v0);
        this.v2subv1 = this.v2.clone().sub(v1);
        this.v0subv2 = this.v0.clone().sub(v2);

        this.normal = this.N.clone().normalize();
    }

    getAABB(): AABB {
        let aabb = new AABB();
        aabb.expand(this.v0);
        aabb.expand(this.v1);
        aabb.expand(this.v2);

        return aabb;
    }

    getCentroid(): Vector3 {
        return this.v0.clone().add(this.v1).add(this.v2).divideScalar(3);
    }

    // from: https://www.lighthouse3d.com/tutorials/maths/ray-triangle-intersection/
    intersect(ray: Ray): PrimitiveIntersection {
        let result = new PrimitiveIntersection();

        let e1 = this.v0v1;
        let e2 = this.v0v2;
        let h = ray.direction.clone().cross(e2);

	    let a = e1.dot(h);

	    if (a > -0.00001 && a < 0.00001)
	    	return result;

	    let f = 1/a;
	    let s = ray.origin.clone().sub(this.v0);
	    let u = f * s.dot(h);

	    if (u < 0.0 || u > 1.0)
	    	return result;

	    let q = s.clone().cross(e1);
	    let v = f * ray.direction.dot(q);

	    if (v < 0.0 || u + v > 1.0)
	    	return result;

	    // at this stage we can compute t to find out where
	    // the intersection point is on the line
	    let t = f * e2.dot(q);

	    if (t > 0.00001) {
            result.intersected = true;
            result.hitPoint = ray.origin.clone().addScaledVector(ray.direction, t);
            result.normal = this.normal;
            result.primitive = this;
            result.t = t;
            result.uvs = new Vector2(u, v);

	    	return result;
        } 

        // this means that there is a line intersection
        // but not a ray intersection
	    return result;
    }
}