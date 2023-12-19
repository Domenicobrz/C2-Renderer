import { Triangle } from '$lib/primitives/triangle';
import { AABB } from './aabb';

const MAX_TRIANGLES_PER_NODE = 2;

export class BVH {
  public root: Node;
  public bvhFlatArray: Node[];

  constructor(public triangles: Triangle[]) {
    this.bvhFlatArray = [];
    this.root = new Node(triangles, 0);

    let stack: Node[] = [];
    if (!this.root.isLeaf()) {
      stack.push(this.root);
    }
    this.bvhFlatArray.push(this.root);

    while (stack.length > 0) {
      // if we get in here, we're sure we're not dealing with a leaf
      let node = stack.pop();

      if (!node) break;

      // find splitting axis
      let splittingAxis = node.getSplittingAxis();

      // divide primitives array by centroid position with respect to splitting axis
      let leftPrims: Triangle[] = [];
      let rightPrims: Triangle[] = [];

      for (let i = 0; i < node.primitives.length; i++) {
        let primitive = node.primitives[i];
        if (primitive.getCentroid()[splittingAxis.axis] < splittingAxis.center) {
          leftPrims.push(primitive);
        } else {
          rightPrims.push(primitive);
        }
      }

      // safeguard for the edge case where all primitives have the same centroid
      if (leftPrims.length === 0 || rightPrims.length === 0) {
        let medianIdx = Math.floor(node.primitives.length / 2);
        for (let i = 0; i < node.primitives.length; i++) {
          if (i < medianIdx) {
            leftPrims.push(node.primitives[i]);
          } else {
            rightPrims.push(node.primitives[i]);
          }
        }
      }

      let leftNode = new Node(leftPrims, this.bvhFlatArray.length);
      this.bvhFlatArray.push(leftNode);

      let rightNode = new Node(rightPrims, this.bvhFlatArray.length);
      this.bvhFlatArray.push(rightNode);

      node.setLeft(leftNode);
      node.setRight(rightNode);

      if (!leftNode.isLeaf()) {
        stack.push(leftNode);
      }
      if (!rightNode.isLeaf()) {
        stack.push(rightNode);
      }

      if (!node.isLeaf()) {
        node.releasePrimitivesArrayMemory(); // release memory
      }
    }

    console.log('bvh nodes count: ' + this.bvhFlatArray.length);
  }

  getBufferData() {
    let { trianglesBufferData, trianglesBufferDataByteSize } = Triangle.getBufferData(
      this.triangles
    );

    // continue here
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct AABB {
        min: vec3f,
        max: vec3f,
      }

      // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html
      struct BVHNode {
        aabb: AABB,
        left: u32,
        right: u32,
        leaf: bool,
        primitives: array<u32, ${MAX_TRIANGLES_PER_NODE}>,
      }
    `;
  }

  //   intersect(ray: Ray): PrimitiveIntersection {
  //     let stack: Node[] = [this.root];

  //     let closestPrimitiveIntersection = new PrimitiveIntersection();

  //     if (!this.root.nodeAABB.intersect(ray)) return closestPrimitiveIntersection;

  //     let nodesEvaluated = 0;
  //     let primitivesTested = 0;

  //     while (stack.length > 0) {
  //       let node = stack.pop();
  //       nodesEvaluated++;

  //       if (node.isLeaf()) {
  //         // try to hit all its primitives
  //         let primitives = node.primitives;
  //         for (let i = 0; i < primitives.length; i++) {
  //           let intersection = primitives[i].intersect(ray);
  //           primitivesTested++;

  //           if (intersection.intersected && intersection.t < closestPrimitiveIntersection.t) {
  //             closestPrimitiveIntersection = intersection;
  //           }
  //         }

  //         if (!closestPrimitiveIntersection.intersected) {
  //           continue;
  //         }
  //       }

  //       if (!node.isLeaf()) {
  //         // get ts of both nodes
  //         let leftIntersection = node.left.nodeAABB.intersect(ray);
  //         let rightIntersection = node.right.nodeAABB.intersect(ray);

  //         let closestNode: Node, otherNode: Node;
  //         let closestNodeIntersection: AABBIntersection, otherNodeIntersection: AABBIntersection;

  //         if (leftIntersection.t < rightIntersection.t) {
  //           closestNode = node.left;
  //           otherNode = node.right;
  //           closestNodeIntersection = leftIntersection;
  //           otherNodeIntersection = rightIntersection;
  //         } else {
  //           closestNode = node.right;
  //           otherNode = node.left;
  //           closestNodeIntersection = rightIntersection;
  //           otherNodeIntersection = leftIntersection;
  //         }

  //         if (
  //           closestNodeIntersection.hit &&
  //           closestNodeIntersection.t < closestPrimitiveIntersection.t
  //         ) {
  //           stack.push(closestNode);
  //         }
  //         if (otherNodeIntersection.hit && otherNodeIntersection.t < closestPrimitiveIntersection.t) {
  //           stack.push(otherNode);
  //         }
  //       }
  //     }

  //     return closestPrimitiveIntersection;
  //   }
}

type SplittingAxis = {
  axis: 'x' | 'y' | 'z';
  center: number;
};

class Node {
  public nodeAABB: AABB;
  public leaf: boolean = false;
  public left: Node | null = null;
  public right: Node | null = null;

  constructor(public primitives: Triangle[], public flatArrayIndex: number) {
    this.nodeAABB = new AABB();
    for (let i = 0; i < primitives.length; i++) {
      this.nodeAABB.expand(primitives[i].getAABB());
    }

    if (primitives.length <= MAX_TRIANGLES_PER_NODE) {
      this.leaf = true;
    }
  }

  setLeft(node: Node) {
    this.left = node;
  }

  setRight(node: Node) {
    this.right = node;
  }

  isLeaf(): boolean {
    return this.leaf;
  }

  releasePrimitivesArrayMemory() {
    this.primitives = [];
  }

  getSplittingAxis(): SplittingAxis {
    // a more robus way of finding a splitting axis (which does not involve just examining
    // the node's AABB)
    // is to iterate all primitives and find the longest axis from their centroids
    let min_x = Infinity;
    let min_y = Infinity;
    let min_z = Infinity;

    let max_x = -Infinity;
    let max_y = -Infinity;
    let max_z = -Infinity;

    for (let i = 0; i < this.primitives.length; i++) {
      let prim = this.primitives[i];
      let centroid = prim.getCentroid();

      if (centroid.x < min_x) min_x = centroid.x;
      if (centroid.y < min_y) min_y = centroid.y;
      if (centroid.z < min_z) min_z = centroid.z;

      if (centroid.x > max_x) max_x = centroid.x;
      if (centroid.y > max_y) max_y = centroid.y;
      if (centroid.z > max_z) max_z = centroid.z;
    }

    let xa = max_x - min_x;
    let ya = max_y - min_y;
    let za = max_z - min_z;

    if (xa > ya && xa > za) {
      return {
        axis: 'x',
        center: (max_x + min_x) * 0.5
      };
    }
    if (ya > xa && ya > za) {
      return {
        axis: 'y',
        center: (max_y + min_y) * 0.5
      };
    }
    // here we're just returning z without the if statement to make sure
    // that in the case where every object has the same centroid, at least something is selected
    return {
      axis: 'z',
      center: (max_z + min_z) * 0.5
    };
  }
}
