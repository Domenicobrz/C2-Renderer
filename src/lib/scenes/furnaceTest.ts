import {
  BoxGeometry,
  Color,
  Mesh,
  PlaneGeometry,
  SphereGeometry,
  TextureLoader,
  Vector2,
  Vector3
} from 'three';
import { Diffuse } from '../materials/diffuse';
import { Emissive } from './../materials/emissive';
import type { Material } from './../materials/material';
import { Triangle } from './../primitives/triangle';
import { TorranceSparrow } from './../materials/torranceSparrow';
import random, { RNG } from 'random';
import { Dielectric } from '$lib/materials/dielectric';
import { meshToTriangles } from '$lib/utils/three/meshToTriangles';
import type { C2Scene } from '$lib/createScene';
import { Orbit } from '$lib/controls/Orbit';
import { Envmap } from '$lib/envmap/envmap';

export async function furnaceTestScene(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [];

  let mesh = new Mesh(new SphereGeometry(1, 80, 80));
  mesh.scale.set(2, 2, 2);
  mesh.position.set(0, 0, 2);

  let planeMesh = new Mesh(new PlaneGeometry(1, 1));
  planeMesh.scale.set(2, 2, 1);
  planeMesh.position.set(0, 0, 2);
  planeMesh.rotation.y = Math.PI;

  let roughnessMap = (
    await new TextureLoader().loadAsync('scene-assets/textures/roughness-test.png')
  ).source.data;

  // let mat = new TorranceSparrow({
  //   color: new Color(0.99, 0.99, 0.99),
  //   roughness: 1,
  //   anisotropy: 0
  //   // roughnessMap
  // });
  let mat = new Dielectric({
    absorption: new Color(0, 0, 0),
    // roughness: 0.25,
    roughness: 0.8,
    anisotropy: 0,
    // roughness: 1,
    // anisotropy: 0,
    eta: 1.5
  });
  materials.push(mat);
  triangles = [...triangles, ...meshToTriangles(mesh, materials.length - 1)];
  // triangles = [...triangles, ...meshToTriangles(planeMesh, materials.length - 1)];

  // create & set camera
  const camera = new Orbit();
  camera.set(new Vector3(0, 2, -10), new Vector3(0, 0, 0));
  camera.movementSpeed = 0.15;

  camera.aperture = 0;
  camera.fov = 0.69;
  camera.focusDistance = 9.53;
  camera.exposure = 1.85;

  let envmap = new Envmap();
  await envmap.fromEquirect('scene-assets/envmaps/furnace_test.hdr', 100);

  return { triangles, materials, camera, envmap };
}
