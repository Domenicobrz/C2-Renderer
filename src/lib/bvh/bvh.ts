import { Triangle } from '$lib/primitives/triangle';
import { AABB } from './aabb';

// at the moment I can't change this value because I'm not considering how padding
// will change the offsets created by offset-computer.
const MAX_TRIANGLES_PER_NODE = 2;

export class BVH {
  public root: Node;
  public bvhFlatArray: Node[];

  constructor(public triangles: Triangle[]) {
    if (triangles.length > 2147483648) {
      throw new Error(
        'Exceeded max primitives count, the webGPU primitives array holds i32 indexes'
      );
    }

    // each triangle needs to know at which position they're being saved
    // in the triangles array
    triangles.forEach((triangle, i) => {
      triangle.setIdxRef(i);
    });

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

    if (this.bvhFlatArray.length > 2147483648) {
      throw new Error(`
        Exceeded max bvh nodes count, the webGPU left/right props holds i32 indexes,
        also, maximum stack-intersection-depth is set to 32 when intersecting the bvh
      `);
    }
  }

  getBufferData() {
    const structSize = 64;
    const BVHBufferDataByteSize = structSize * this.bvhFlatArray.length;
    const BVHBufferData = new ArrayBuffer(BVHBufferDataByteSize);

    console.log(this.bvhFlatArray);

    this.bvhFlatArray.forEach((node, ni) => {
      const aabbMax = node.nodeAABB.max;
      const aabbMin = node.nodeAABB.min;
      const isLeaf = node.isLeaf();
      let left = -1,
        right = -1;
      let primitives: number[] = Array(MAX_TRIANGLES_PER_NODE).fill(-1);

      if (!isLeaf && node.left && node.right) {
        left = node.left.flatArrayIndex;
        right = node.right.flatArrayIndex;
      }
      if (isLeaf) {
        node.primitives.forEach((prim, i) => {
          primitives[i] = prim.idxRef;
        });
      }

      const ioff = ni * structSize;
      const BVHViews = {
        aabb: {
          min: new Float32Array(BVHBufferData, 0 + ioff, 3),
          max: new Float32Array(BVHBufferData, 16 + ioff, 3)
        },
        left: new Int32Array(BVHBufferData, 32 + ioff, 1),
        right: new Int32Array(BVHBufferData, 36 + ioff, 1),
        leaf: new Uint32Array(BVHBufferData, 40 + ioff, 1),
        primitives: new Int32Array(BVHBufferData, 44 + ioff, 2)
      };

      BVHViews.aabb.min.set([aabbMin.x, aabbMin.y, aabbMin.z]);
      BVHViews.aabb.max.set([aabbMax.x, aabbMax.y, aabbMax.z]);
      BVHViews.left.set([left]);
      BVHViews.right.set([right]);
      BVHViews.leaf.set([isLeaf ? 1 : 0]);
      BVHViews.primitives.set(primitives);
    });

    return {
      ...Triangle.getBufferData(this.triangles),
      BVHBufferData,
      BVHBufferDataByteSize
    };
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html
      struct BVHNode {
        aabb: AABB,
        left: i32, // can be -1
        right: i32, 
        leaf: u32, // bool is apparently non-host something
        // i32 is necessary since we're using -1 for null
        primitives: array<i32, ${MAX_TRIANGLES_PER_NODE}>, 
      }

      struct BVHIntersectionResult {
        hit: bool,
        t: f32,
        hitPoint: vec3f,
        triangle: Triangle,
      }
    `;
  }

  static shaderIntersect() {
    return /* wgsl */ `
      fn bvhIntersect(ray: Ray) -> BVHIntersectionResult {
        let rootNode = bvhData[0];

        if (!aabbIntersect(ray.origin, ray.direction, rootNode.aabb).hit) {
          return BVHIntersectionResult(false, 0, vec3f(0,0,0), triangles[0]);
        }

        // from: https://github.com/gpuweb/gpuweb/issues/3431#issuecomment-1453667278
        let highestFloat = 0x1.fffffep+127f;
        var closestIntersection = IntersectionResult(false, highestFloat, vec3f(0,0,0));
        var closestPrimitiveIndex = -1;

        var stack = array<i32, 64>();
        // set the first element to the root index of the bvhData array
        stack[0] = 0;
        var stackPointer = 0;

        while (stackPointer > -1) {
          let nodeIndex = stack[stackPointer];
          stackPointer -= 1;

          let node = bvhData[nodeIndex];

          if (node.leaf == 1) {
            // try to hit all its primitives
            let primitivesIndexes = node.primitives;
            for (var i = 0; i < ${MAX_TRIANGLES_PER_NODE}; i++) {
              let primitiveIndex = primitivesIndexes[i];
              let isValidIndex = primitiveIndex > -1;
              if (!isValidIndex) { continue; };

              let primitive = triangles[primitiveIndex];
              let ires = intersectTriangle(primitive, ray);
              if (ires.hit && ires.t < closestIntersection.t) {
                closestIntersection = ires;
                closestPrimitiveIndex = primitiveIndex;
              }
            }
          }
        }

        return BVHIntersectionResult(
          closestIntersection.hit, 
          closestIntersection.t, 
          closestIntersection.hitPoint, 
          triangles[closestPrimitiveIndex]
        );
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
