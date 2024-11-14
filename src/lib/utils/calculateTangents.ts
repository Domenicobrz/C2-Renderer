import { BufferAttribute, type BufferGeometry, type Vector2, type Vector3 } from 'three';
import { vec2, vec3 } from './math';

export function computeGeometryTangents(geometry: BufferGeometry) {
  let posArray = geometry.attributes.position.array;
  let uvArray = geometry.attributes.uv?.array || [];
  if (!uvArray) return;

  let indexArray = geometry.index?.array;
  if (!indexArray) return;

  let verticesToTangents: Vector3[][] = [];

  for (let i = 0; i < indexArray.length; i += 3) {
    let idx0 = indexArray[i + 0];
    let idx1 = indexArray[i + 1];
    let idx2 = indexArray[i + 2];

    let v0 = vec3(posArray[idx0 * 3 + 0], posArray[idx0 * 3 + 1], posArray[idx0 * 3 + 2]);
    let v1 = vec3(posArray[idx1 * 3 + 0], posArray[idx1 * 3 + 1], posArray[idx1 * 3 + 2]);
    let v2 = vec3(posArray[idx2 * 3 + 0], posArray[idx2 * 3 + 1], posArray[idx2 * 3 + 2]);
    let uv0 = vec2(uvArray[idx0 * 2 + 0], uvArray[idx0 * 2 + 1]);
    let uv1 = vec2(uvArray[idx1 * 2 + 0], uvArray[idx1 * 2 + 1]);
    let uv2 = vec2(uvArray[idx2 * 2 + 0], uvArray[idx2 * 2 + 1]);

    let tangent = getTangent(v0, v1, v2, uv0, uv1, uv2);

    if (!verticesToTangents[idx0]) verticesToTangents[idx0] = [];
    if (!verticesToTangents[idx1]) verticesToTangents[idx1] = [];
    if (!verticesToTangents[idx2]) verticesToTangents[idx2] = [];

    verticesToTangents[idx0].push(tangent);
    verticesToTangents[idx1].push(tangent);
    verticesToTangents[idx2].push(tangent);
  }

  let tangentsArray = [];
  for (let i = 0; i < verticesToTangents.length; i++) {
    let tangents = verticesToTangents[i] || [];

    let sum = vec3(0, 0, 0);
    for (let t = 0; t < tangents.length; t++) {
      sum.add(tangents[t]);
    }
    sum.divideScalar(tangents.length);

    // sometimes unfortunately tangents end up being 0,0,0 and that wreaks havoc
    // on the renderer
    if (sum.x == 0 && sum.y == 0 && sum.z == 0) {
      let useableTangentIndex = 0;
      for (let t = 0; t < tangents.length; t++) {
        let tan = tangents[t];
        if (tan.x != 0.0 || tan.y != 0.0 || tan.z != 0.0) {
          useableTangentIndex = t;
        }
      }
      sum.copy(tangents[useableTangentIndex]);
    }

    tangentsArray.push(sum.x, sum.y, sum.z);
  }

  geometry.setAttribute('tangent', new BufferAttribute(new Float32Array(tangentsArray), 3));
}

export function getTangent(
  v0: Vector3,
  v1: Vector3,
  v2: Vector3,
  uv0: Vector2,
  uv1: Vector2,
  uv2: Vector2
) {
  var malconstructedUvs = false;
  let tangent = vec3(0, 0, 0);

  // check if uvs exist, if they do let's use uv-based tangents
  if (uv0.x > -1) {
    let edge1 = v1.clone().sub(v0);
    let edge2 = v2.clone().sub(v0);
    let deltaUV1 = uv1.clone().sub(uv0);
    let deltaUV2 = uv2.clone().sub(uv0);

    let div = deltaUV1.x * deltaUV2.y - deltaUV2.x * deltaUV1.y;
    let f = 1.0 / div;
    if (div == 0.0) {
      malconstructedUvs = true;
    }

    tangent = vec3(
      f * (deltaUV2.y * edge1.x - deltaUV1.y * edge2.x),
      f * (deltaUV2.y * edge1.y - deltaUV1.y * edge2.y),
      f * (deltaUV2.y * edge1.z - deltaUV1.y * edge2.z)
    ).normalize();

    // for some reason, specifying the bitangent this way causes issues
    // *bitangent = normalize(vec3f(
    //   f * (-deltaUV2.x * edge1.x + deltaUV1.x * edge2.x),
    //   f * (-deltaUV2.x * edge1.y + deltaUV1.x * edge2.y),
    //   f * (-deltaUV2.x * edge1.z + deltaUV1.x * edge2.z)
    // ));

    // *bitangent = normalize(cross(*tangent, geometricNormal));
  }

  if (uv0.x < -0.9 || malconstructedUvs) {
    // otherwise default to auto geometry-based tangents
    tangent = v1.clone().sub(v0).normalize();
    // *bitangent = normalize(cross(*tangent, geometricNormal));
  }

  return tangent;
}
