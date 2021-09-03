import { Primitive } from "../primitives/primitive";
import { AABB } from "./aabb";
import { PrimitiveIntersection } from "./intersection";
import { Ray } from "./ray";

const MAX_PRIMITIVES_PER_NODE = 2;

export class BVH {
    constructor(
        public primitives: Primitive[]
    ) {
        let sceneAABB = new AABB();
        for (let i = 0; i < primitives.length; i++) {
            sceneAABB.expand(primitives[i].getAABB());
        }

        let stack = [
            new Node(null, null, sceneAABB, primitives, false)
        ];

        while(stack.length > 0) {
            let node = stack.pop();
            if(node.primitives.length > MAX_PRIMITIVES_PER_NODE) {
                // create two new nodes?

                // find splitting axis

                // divide primitives array by centroid position with respect to splitting axis

                // recalculate aabb of both new nodes?
                // ^ this could be a method of Node, and it would be useful to remove the first few lines of this constructor
                //   where we're essentially calculating what that function would do for us

                // set this node as not a leaf, and set it's primitives array to null to save memory
            }
        }
    }

    intersect(ray: Ray): PrimitiveIntersection {
        return new PrimitiveIntersection();
    }
}

class Node {
    constructor(
        public left:  Node | null,
        public right: Node | null,
        public aabb: AABB,
        public primitives: Primitive[],
        public leaf: boolean,
    ) {

    }
}