import { BufferAttribute, BufferGeometry, Matrix4, Mesh, Object3D, Vector2, Vector3 } from 'three';
import { vec2, vec3 } from '../math';
import { Triangle } from '$lib/primitives/triangle';
import { computeGeometryTangents, getTangent } from '../calculateTangents';

export function geometryToTriangles(
  geometry: BufferGeometry,
  materialIndex: number,
  matrix?: Matrix4
) {
  let triangles: Triangle[] = [];

  // The computation is only supported for indexed geometries and if position and
  // and uv attributes are defined, for non-indexed geometries the Triangle class
  // will automatically create the tangents
  computeGeometryTangents(geometry);

  geometry = geometry.toNonIndexed();
  // the geometry is now non-indexed, so "compute vertex normals"
  // in reality computes face normals since vertices are disconnected
  // geometry.computeVertexNormals();
  if (matrix) {
    geometry.applyMatrix4(matrix);
  }

  let matrixDeterminant = matrix?.determinant();

  let posArray = geometry.attributes.position.array;
  let normArray = geometry.attributes.normal.array;
  let uvArray = geometry.attributes.uv?.array || [];
  let tangentArray = geometry.attributes.tangent?.array || [];

  let hasUvs = uvArray.length > 0;
  let hasTangents = tangentArray.length > 0;

  for (let i = 0; i < geometry.attributes.position.count; i += 3) {
    let n0x = normArray[i * 3 + 0];
    let n0y = normArray[i * 3 + 1];
    let n0z = normArray[i * 3 + 2];
    let v0 = vec3(posArray[i * 3 + 0], posArray[i * 3 + 1], posArray[i * 3 + 2]);
    let uv0 = vec2(uvArray[i * 2 + 0], uvArray[i * 2 + 1]);

    let v1 = vec3(posArray[(i + 1) * 3 + 0], posArray[(i + 1) * 3 + 1], posArray[(i + 1) * 3 + 2]);
    let n1x = normArray[(i + 1) * 3 + 0];
    let n1y = normArray[(i + 1) * 3 + 1];
    let n1z = normArray[(i + 1) * 3 + 2];
    let uv1 = vec2(uvArray[(i + 1) * 2 + 0], uvArray[(i + 1) * 2 + 1]);

    let v2 = vec3(posArray[(i + 2) * 3 + 0], posArray[(i + 2) * 3 + 1], posArray[(i + 2) * 3 + 2]);
    let n2x = normArray[(i + 2) * 3 + 0];
    let n2y = normArray[(i + 2) * 3 + 1];
    let n2z = normArray[(i + 2) * 3 + 2];
    let uv2 = vec2(uvArray[(i + 2) * 2 + 0], uvArray[(i + 2) * 2 + 1]);

    let tg0 = vec3(tangentArray[i * 3 + 0], tangentArray[i * 3 + 1], tangentArray[i * 3 + 2]);
    let tg1 = vec3(
      tangentArray[(i + 1) * 3 + 0],
      tangentArray[(i + 1) * 3 + 1],
      tangentArray[(i + 1) * 3 + 2]
    );
    let tg2 = vec3(
      tangentArray[(i + 2) * 3 + 0],
      tangentArray[(i + 2) * 3 + 1],
      tangentArray[(i + 2) * 3 + 2]
    );

    triangles.push(
      new Triangle(
        v0,
        v1,
        v2,
        materialIndex,
        vec3(n0x, n0y, n0z),
        vec3(n1x, n1y, n1z),
        vec3(n2x, n2y, n2z),
        hasUvs ? uv0 : undefined,
        hasUvs ? uv1 : undefined,
        hasUvs ? uv2 : undefined,
        hasTangents ? tg0 : undefined,
        hasTangents ? tg1 : undefined,
        hasTangents ? tg2 : undefined,
        matrixDeterminant
      )
    );
  }

  return triangles;
}
