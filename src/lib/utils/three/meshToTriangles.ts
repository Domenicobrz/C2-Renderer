import { Mesh, Object3D } from 'three';
import { vec2, vec3 } from '../math';
import { Triangle } from '$lib/primitives/triangle';
import { geometryToTriangles } from './geometryToTriangles';

export function meshToTriangles(
  parentMesh: Object3D,
  materialIndex: number,
  noTraversal: boolean = false,
  flipYuv: boolean = false
) {
  let triangles: Triangle[] = [];

  if (noTraversal) {
    parentMesh.updateMatrix();
    parentMesh.updateMatrixWorld(true);
    if (parentMesh instanceof Mesh) {
      triangles = [
        ...triangles,
        ...geometryToTriangles(parentMesh.geometry, materialIndex, parentMesh.matrixWorld, flipYuv)
      ];
      return triangles;
    }
  }

  parentMesh.traverse((obj) => {
    obj.updateMatrix();
    obj.updateMatrixWorld(true);

    if (obj instanceof Mesh) {
      let mesh = obj;
      let geometry = mesh.geometry;

      triangles = [
        ...triangles,
        ...geometryToTriangles(geometry, materialIndex, mesh.matrixWorld, flipYuv)
      ];
    }
  });

  return triangles;
}
