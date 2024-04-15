import { Mesh } from 'three';
import { vec2, vec3 } from '../math';
import { Triangle } from '$lib/primitives/triangle';

export function meshToTriangles(parentMesh: Mesh, materialIndex: number) {
  let triangles: Triangle[] = [];

  parentMesh.traverse((obj) => {
    if (obj instanceof Mesh) {
      let mesh = obj;

      mesh.updateMatrix();
      mesh.updateMatrixWorld(true);

      let geometry = mesh.geometry;
      geometry = geometry.toNonIndexed();
      geometry.applyMatrix4(mesh.matrixWorld);

      let posArray = geometry.attributes.position.array;
      let normArray = geometry.attributes.normal.array;
      let uvArray = geometry.attributes.uv.array;

      for (let i = 0; i < geometry.attributes.position.count; i += 3) {
        let v0x = posArray[i * 3 + 0];
        let v0y = posArray[i * 3 + 1];
        let v0z = posArray[i * 3 + 2];
        let n0x = normArray[i * 3 + 0];
        let n0y = normArray[i * 3 + 1];
        let n0z = normArray[i * 3 + 2];
        let uv0x = uvArray[i * 2 + 0];
        let uv0y = uvArray[i * 2 + 1];

        let v1x = posArray[(i + 1) * 3 + 0];
        let v1y = posArray[(i + 1) * 3 + 1];
        let v1z = posArray[(i + 1) * 3 + 2];
        let n1x = normArray[(i + 1) * 3 + 0];
        let n1y = normArray[(i + 1) * 3 + 1];
        let n1z = normArray[(i + 1) * 3 + 2];
        let uv1x = uvArray[(i + 1) * 2 + 0];
        let uv1y = uvArray[(i + 1) * 2 + 1];

        let v2x = posArray[(i + 2) * 3 + 0];
        let v2y = posArray[(i + 2) * 3 + 1];
        let v2z = posArray[(i + 2) * 3 + 2];
        let n2x = normArray[(i + 2) * 3 + 0];
        let n2y = normArray[(i + 2) * 3 + 1];
        let n2z = normArray[(i + 2) * 3 + 2];
        let uv2x = uvArray[(i + 2) * 2 + 0];
        let uv2y = uvArray[(i + 2) * 2 + 1];

        triangles.push(
          new Triangle(
            vec3(v0x, v0y, v0z),
            vec3(v1x, v1y, v1z),
            vec3(v2x, v2y, v2z),
            materialIndex,
            undefined,
            vec2(uv0x, uv0y),
            vec2(uv1x, uv1y),
            vec2(uv2x, uv2y)
          )
        );
      }
    }
  });

  return triangles;
}
