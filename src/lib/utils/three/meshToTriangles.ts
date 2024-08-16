import { Mesh, Object3D } from 'three';
import { vec2, vec3 } from '../math';
import { Triangle } from '$lib/primitives/triangle';
import { geometryToTriangles } from './geometryToTriangles';

export function meshToTriangles(parentMesh: Object3D, materialIndex: number) {
  let triangles: Triangle[] = [];

  parentMesh.traverse((obj) => {
    obj.updateMatrix();
    obj.updateMatrixWorld(true);

    if (obj instanceof Mesh) {
      let mesh = obj;
      let geometry = mesh.geometry;

      triangles = [...triangles, ...geometryToTriangles(geometry, materialIndex, mesh.matrixWorld)];
    }
  });

  return triangles;
}
