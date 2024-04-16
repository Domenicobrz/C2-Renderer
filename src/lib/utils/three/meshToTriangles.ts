import { Mesh, Object3D } from 'three';
import { vec2, vec3 } from '../math';
import { Triangle } from '$lib/primitives/triangle';

export function meshToTriangles(parentMesh: Object3D, materialIndex: number) {
  let triangles: Triangle[] = [];

  parentMesh.traverse((obj) => {
    obj.updateMatrix();
    obj.updateMatrixWorld(true);

    if (obj instanceof Mesh) {
      let mesh = obj;

      let geometry = mesh.geometry;
      geometry = geometry.toNonIndexed();
      // the geometry is now non-indexed, so "compute vertex normals"
      // in reality computes face normals since vertices are disconnected
      geometry.computeVertexNormals();
      geometry.applyMatrix4(mesh.matrixWorld);

      let posArray = geometry.attributes.position.array;
      let normArray = geometry.attributes.normal.array;
      let uvArray = geometry.attributes.uv?.array || [];

      let hasUvs = uvArray.length > 0;

      for (let i = 0; i < geometry.attributes.position.count; i += 3) {
        let v0x = posArray[i * 3 + 0];
        let v0y = posArray[i * 3 + 1];
        let v0z = posArray[i * 3 + 2];
        let n0x = normArray[i * 3 + 0];
        let n0y = normArray[i * 3 + 1];
        let n0z = normArray[i * 3 + 2];
        let uv0 = vec2(uvArray[i * 2 + 0], uvArray[i * 2 + 1]);

        let v1x = posArray[(i + 1) * 3 + 0];
        let v1y = posArray[(i + 1) * 3 + 1];
        let v1z = posArray[(i + 1) * 3 + 2];
        let n1x = normArray[(i + 1) * 3 + 0];
        let n1y = normArray[(i + 1) * 3 + 1];
        let n1z = normArray[(i + 1) * 3 + 2];
        let uv1 = vec2(uvArray[(i + 1) * 2 + 0], uvArray[(i + 1) * 2 + 1]);

        let v2x = posArray[(i + 2) * 3 + 0];
        let v2y = posArray[(i + 2) * 3 + 1];
        let v2z = posArray[(i + 2) * 3 + 2];
        let n2x = normArray[(i + 2) * 3 + 0];
        let n2y = normArray[(i + 2) * 3 + 1];
        let n2z = normArray[(i + 2) * 3 + 2];
        let uv2 = vec2(uvArray[(i + 2) * 2 + 0], uvArray[(i + 2) * 2 + 1]);

        triangles.push(
          new Triangle(
            vec3(v0x, v0y, v0z),
            vec3(v1x, v1y, v1z),
            vec3(v2x, v2y, v2z),
            materialIndex,
            vec3(n0x, n0y, n0z),
            hasUvs ? uv0 : undefined,
            hasUvs ? uv1 : undefined,
            hasUvs ? uv2 : undefined
          )
        );
      }
    }
  });

  return triangles;
}
