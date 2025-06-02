import type { C2Scene } from '$lib/createScene';
import { Envmap } from '$lib/envmap/envmap';
import { Emissive } from '$lib/materials/emissive';
import { MATERIAL_TYPE, type Material } from '$lib/materials/material';
import { Triangle } from '$lib/primitives/triangle';
import { Vector2, Vector3 } from 'three';
import { bvhInfo } from '../../routes/stores/main';
import { AABB } from './aabb';

// at the moment I can't change this value because I'm not considering how padding
// will change the offsets created by offset-computer.
const MAX_TRIANGLES_PER_NODE = 2;

export type BVHIntersectionResult = {
  hit: boolean;
  t: number;
  hitPoint: Vector3;
  triangle: Triangle | null;
};

export class BVH {
  public root: Node;
  public bvhFlatArray: Node[];
  public cdfToTriangleIndex: number[][] = [];

  constructor(public scene: C2Scene) {
    let triangles = scene.triangles;

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
        leftPrims = [];
        rightPrims = [];

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

    bvhInfo.set({ nodesCount: this.bvhFlatArray.length });

    if (this.bvhFlatArray.length > 2147483648) {
      throw new Error(`
        Exceeded max bvh nodes count, the webGPU left/right props holds i32 indexes,
        also, maximum stack-intersection-depth is set to 32 when intersecting the bvh
      `);
    }
  }

  intersectRay(ro: Vector3, rd: Vector3): BVHIntersectionResult {
    let rootNode = this.root;

    if (!rootNode.nodeAABB.intersectRay(ro, rd).hit) {
      return { hit: false, t: 0, hitPoint: new Vector3(0, 0, 0), triangle: null };
    }

    // from: https://github.com/gpuweb/gpuweb/issues/3431#issuecomment-1453667278
    let highestFloat = Infinity;
    var closestIntersection = { hit: false, t: highestFloat, hitPoint: new Vector3(0, 0, 0) };
    var closestPrimitive;

    var stack: Node[] = Array(128);
    // set the first element to the root index of the bvhData array
    stack[0] = rootNode;
    var stackPointer = 0;

    while (stackPointer !== -1) {
      let node = stack[stackPointer];
      stackPointer -= 1;

      if (node.leaf) {
        // try to hit all its primitives
        let primitives = node.primitives;
        for (var i = 0; i < primitives.length; i++) {
          let primitive = primitives[i];
          let ires = primitive.intersectRay(ro, rd);
          if (ires.hit && ires.t < closestIntersection.t) {
            closestIntersection = ires;
            closestPrimitive = primitive;
          }
        }
      }

      if (!node.leaf) {
        let leftIres = node.left!.nodeAABB.intersectRay(ro, rd);
        let rightIres = node.right!.nodeAABB.intersectRay(ro, rd);

        var closestNode;
        var otherNode;
        var closestNodeIntersection;
        var otherNodeIntersection;

        if (leftIres.t < rightIres.t) {
          closestNode = node.left;
          otherNode = node.right;
          closestNodeIntersection = leftIres;
          otherNodeIntersection = rightIres;
        } else {
          closestNode = node.right;
          otherNode = node.left;
          closestNodeIntersection = rightIres;
          otherNodeIntersection = leftIres;
        }

        // we want to evaluate other node *after* evaluating the closest node, thus
        // we're placing it sooner inside the stack
        if (otherNodeIntersection.hit && otherNodeIntersection.t < closestIntersection.t) {
          stackPointer += 1;
          stack[stackPointer] = otherNode!;
        }

        if (closestNodeIntersection.hit && closestNodeIntersection.t < closestIntersection.t) {
          stackPointer += 1;
          stack[stackPointer] = closestNode!;
        }
      }
    }

    return {
      hit: closestIntersection.hit,
      t: closestIntersection.t,
      hitPoint: closestIntersection.hitPoint,
      triangle: closestPrimitive || null
    };
  }

  getBufferData() {
    const structSize = 64;
    const BVHBufferDataByteSize = structSize * this.bvhFlatArray.length;
    const BVHBufferData = new ArrayBuffer(BVHBufferDataByteSize);

    let triangles = this.scene.triangles;
    let materials = this.scene.materials;

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

    const materialOffsetsByIndex: number[] = [];
    for (let i = 0; i < materials.length; i++) {
      if (i === 0) {
        materialOffsetsByIndex.push(0);
      } else {
        let prevMax = materialOffsetsByIndex[i - 1];
        let prevMat = materials[i - 1];
        materialOffsetsByIndex.push(prevMax + prevMat.offsetCount);
      }
    }

    return {
      ...Triangle.getBufferData(triangles, materialOffsetsByIndex),
      BVHBufferData,
      BVHBufferDataByteSize
    };
  }

  computeLightPickProbabilities() {
    let sum = 0;
    this.cdfToTriangleIndex = [];

    let triangles = this.scene.triangles;
    let materials = this.scene.materials;

    triangles.forEach((t) => {
      let material = materials[t.materialIndex];
      if (material instanceof Emissive) {
        this.cdfToTriangleIndex.push([sum, t.getLuminance(material), t.idxRef]);
        sum += t.getLuminance(material);
      }
    });

    if (this.scene.envmap) {
      let envmapRadius = this.root.nodeAABB.max.clone().sub(this.root.nodeAABB.min).length();
      let envmapLuminance =
        4 *
        Math.PI *
        envmapRadius *
        envmapRadius *
        this.scene.envmap.scale *
        this.scene.envmap.luminanceAverage;
      this.cdfToTriangleIndex.push([
        sum,
        envmapLuminance,
        -2 /* signals envmap instead of triangle */
      ]);
      sum += envmapLuminance;
    }

    // normalize cdf and pdf values
    this.cdfToTriangleIndex.forEach((el) => {
      el[0] /= sum;
      el[1] /= sum;

      let lightPickProbability = el[1];
      let triangleIndex = el[2];

      if (triangleIndex > 0) {
        triangles[triangleIndex].setLightSourcePickProb(lightPickProbability);
      } else if (triangleIndex === -2 && this.scene.envmap) {
        this.scene.envmap.setLightSourcePickProb(lightPickProbability);
      }
    });
  }

  getLightsCDFBufferData() {
    const LightsCDFBufferDataByteSize = 12 * this.cdfToTriangleIndex.length;
    const LightsCDFBufferData = new ArrayBuffer(LightsCDFBufferDataByteSize);
    this.cdfToTriangleIndex.forEach((el, i) => {
      let offs = 12 * i;

      let cdf = new Float32Array(LightsCDFBufferData, offs + 0, 1);
      cdf.set([el[0]]);
      let pdf = new Float32Array(LightsCDFBufferData, offs + 4, 1);
      pdf.set([el[1]]);
      let triangleIndex = new Uint32Array(LightsCDFBufferData, offs + 8, 1);
      triangleIndex.set([el[2]]);
    });

    return {
      LightsCDFBufferData,
      LightsCDFBufferDataByteSize
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
        surfaceAttributes: SurfaceAttributes,
        triangle: Triangle,
        triangleIndex: i32,
        barycentrics: vec2f,
      }

      struct LightCDFEntry {
        cdf: f32,
        pdf: f32,
        // -2 indicates an envmap (we'll reserve -1 for null or something similiar)
        triangleIndex: i32,
      }

      struct LightSample {
        isEnvmap: bool,
        backSideHit: bool,
        pdf: f32,
        direction: vec3f,
        radiance: vec3f,
        hitPoint: vec3f,
        triangleIndex: i32,
        barycentrics: vec2f,
        geometricNormal: vec3f,
      }

      struct SurfaceDescriptor {
        triangleIndex: i32,
        barycentrics: vec2f,
      };
    `;
  }

  static shaderIntersect() {
    return /* wgsl */ `
      fn getLightSample(
        rayOrigin: vec3f, rands: vec4f
      ) -> LightSample {
        let cdfEntry = getLightCDFEntry(rands.z);

        if (cdfEntry.triangleIndex > -1) {
          let triangle = triangles[cdfEntry.triangleIndex];
          let sampleResult = sampleTrianglePoint(triangle, vec2f(rands.x, rands.y));
          let samplePoint = sampleResult.point;

          let samplePointT = length(samplePoint - rayOrigin);
          let lD = normalize(samplePoint - rayOrigin);
          let sampleDirection = lD;
  
          let r2 = squaredLength(samplePoint - rayOrigin);
          var lN = triangle.geometricNormal;
          var lNolD = dot(lN, -lD);
          var backSideHit = false;
          if (lNolD < 0) {
            lN = -lN;
            lNolD = -lNolD;
            backSideHit = true;
          }
          if (lNolD == 0) {
            // in this case the ray is perpendicular to the normal,
            // we'll consider it a backSideHit such that the misWeight will be
            // set to 0
            backSideHit = true;
          }
          var lightSamplePdf = r2 / (lNolD * triangle.area);
          lightSamplePdf *= cdfEntry.pdf;

          if (backSideHit) {
            return LightSample(false, false, 0, vec3f(0), vec3f(0), vec3f(0.0), -1, vec2f(0), vec3f(0));
          }
          
          let ires = bvhIntersect(Ray(rayOrigin + sampleDirection * 0.001, sampleDirection));
          if (!ires.hit || cdfEntry.triangleIndex != ires.triangleIndex) {
            return LightSample(false, false, 0, vec3f(0), vec3f(0), vec3f(0.0), -1, vec2f(0), vec3f(0));
          }
          let material: Emissive = createEmissive(ires.triangle.materialOffset);
          let emissive = material.color * material.intensity;
          let radiance = emissive;

          return LightSample(
            false, backSideHit, lightSamplePdf, sampleDirection, radiance, 
            samplePoint, cdfEntry.triangleIndex, sampleResult.barycentrics,
            lN
          );
        }

        if (cdfEntry.triangleIndex == -2) {
          // envmap sampling
          let sample = samplePC2D(
            envmapPC2D.size, 
            AABB(envmapPC2D.domainmin, envmapPC2D.domainmax), 
            rands.xy,
          );

          let uv = sample.floatOffset;
          let pc2d_pdf = sample.pdf;
          var sampleDirection = envEqualAreaSquareToSphere(uv);
          sampleDirection = envmapInfo.invTransform * sampleDirection;
          // change of variable, from square image to sphere pdf
          var lightSamplePdf = pc2d_pdf / (4 * PI);
          lightSamplePdf *= cdfEntry.pdf;

          let ires = bvhIntersect(Ray(rayOrigin + sampleDirection * 0.001, sampleDirection));
          if (ires.hit) {
            return LightSample(false, false, 0, vec3f(0), vec3f(0), vec3f(0.0), -1, vec2f(0), vec3f(0));
          }
          let radiance = getEnvmapRadiance(sampleDirection);

          return LightSample(true, false, lightSamplePdf, sampleDirection, radiance, vec3f(0.0), -1, uv, vec3f(0));
        }

        return LightSample(false, false, 0, vec3f(0), vec3f(0), vec3f(0.0), -1, vec2f(0), vec3f(0));
      }

      fn getLightPDF(ray: Ray) -> f32 {
        let ires = bvhIntersect(Ray(ray.origin + ray.direction * 0.001, ray.direction));

        if (ires.hit) {
          // if we don't hit a primitive, bvhIntersect will set ires.triangle to the first triangle
          // of the scene. Keep in mind that ires.hit will be false
          let materialType = materialsBuffer[ires.triangle.materialOffset];
          var lightSamplePdf = 0.0;
          if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
            let lD = ray.direction;
            let r2 = squaredLength(ires.hitPoint - ray.origin);
            var lN = ires.triangle.geometricNormal;
            var lNolD = dot(lN, -lD);
            if (lNolD < 0) {
              lN = -lN;
              lNolD = -lNolD;
            }
            lightSamplePdf = r2 / (lNolD * ires.triangle.area);
            // probability of picking this triangle from the getLightCDFEntry(...)
            lightSamplePdf *= ires.triangle.lightSourcePickProb;

            return lightSamplePdf;
          } 
        } else if (shaderConfig.HAS_ENVMAP) {
          // envmap pdf retrieval
          let dir = envmapInfo.transform * ray.direction;
          let uv = envEqualAreaSphereToSquare(dir);
          var pdf = getPC2Dpdf( 
            envmapPC2D.size, 
            uv, 
            AABB(envmapPC2D.domainmin, envmapPC2D.domainmax),
          );
          // probability of picking the envmap from the getLightCDFEntry(...)
          pdf *= envmapInfo.lightSourcePickProb;

          return pdf / (4 * PI);
        }
        
        return 0;
      }

      fn getLightCDFEntry(r: f32) -> LightCDFEntry {
        var si: i32 = 0;
        var ei: i32 = i32(arrayLength(&lightsCDFData));
        
        var mid: i32 = -2;
        var fidx: i32 = -1;
        
        while (fidx != mid) {
          mid = (si + ei) / 2;
          fidx = mid;

          let cdf = lightsCDFData[mid].cdf;

          if (r > cdf) {
            si = mid;
            mid = (si + ei) / 2;
          }
          if (r < cdf) {
            ei = mid;
            mid = (si + ei) / 2;
          }
        }

        return lightsCDFData[fidx];
      }

      fn bvhIntersect(ray: Ray) -> BVHIntersectionResult {
        let rootNode = bvhData[0];

        if (!aabbIntersect(ray.origin, ray.direction, rootNode.aabb).hit) {
          return BVHIntersectionResult(
            false, 0, vec3f(0), SurfaceAttributes(), triangles[0], 0, vec2f(0)
          );
        }

        // from: https://github.com/gpuweb/gpuweb/issues/3431#issuecomment-1453667278
        let highestFloat = 0x1.fffffep+127f;
        var closestIntersection = IntersectionResult(
          false, highestFloat, vec3f(0), vec2f(0), vec3f(0), vec3f(0), vec2f(0.0)
        );
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

          if (node.leaf == 0) {
            let leftIres = aabbIntersect(ray.origin, ray.direction, bvhData[node.left].aabb);
            let rightIres = aabbIntersect(ray.origin, ray.direction, bvhData[node.right].aabb);

            var closestNodeIndex: i32;
            var otherNodeIndex: i32;
            var closestNodeIntersection: AABBIntersectionResult;
            var otherNodeIntersection: AABBIntersectionResult;

            if (leftIres.t < rightIres.t) {
              closestNodeIndex = node.left;
              otherNodeIndex = node.right;
              closestNodeIntersection = leftIres;
              otherNodeIntersection = rightIres;
            } else {
              closestNodeIndex = node.right;
              otherNodeIndex = node.left;
              closestNodeIntersection = rightIres;
              otherNodeIntersection = leftIres;
            }

            // we want to evaluate other node *after* evaluating the closest node, thus 
            // we're placing it sooner inside the stack            
            if (otherNodeIntersection.hit && otherNodeIntersection.t < closestIntersection.t) {
              stackPointer += 1;
              stack[stackPointer] = otherNodeIndex;
            }

            if (
              closestNodeIntersection.hit &&
              closestNodeIntersection.t < closestIntersection.t
            ) {
              stackPointer += 1;
              stack[stackPointer] = closestNodeIndex;
            }
          }
        }

        return BVHIntersectionResult(
          closestIntersection.hit, 
          closestIntersection.t, 
          closestIntersection.hitPoint, 
          SurfaceAttributes(
            closestIntersection.normal,
            closestIntersection.uv,
            closestIntersection.tangent
          ),
          triangles[closestPrimitiveIndex],
          closestPrimitiveIndex,
          closestIntersection.barycentrics
        );
      } 
    `;
  }
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
