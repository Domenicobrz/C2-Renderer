import { Color, Mesh, PlaneGeometry, SphereGeometry, TextureLoader, Vector2, Vector3 } from 'three';
import { Diffuse } from '../materials/diffuse';
import { Emissive } from './../materials/emissive';
import type { Material } from './../materials/material';
import { Triangle } from './../primitives/triangle';
import { meshToTriangles } from '$lib/utils/three/meshToTriangles';
import type { C2Scene } from '$lib/createScene';
import { Orbit } from '$lib/controls/Orbit';
import { geometryToTriangles } from '$lib/utils/three/geometryToTriangles';
import { TorranceSparrow } from '$lib/materials/torranceSparrow';
import random, { RNG } from 'random';

random.use('test-string' as unknown as RNG);
// random.use(Math.random() as unknown as RNG);
let r = random.float;
let nr = function () {
  return r() * 2 - 1;
};

export async function ReSTIRTest2Scene(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse({ color: new Color(0.95, 0.95, 0.95) }),
    new Emissive({ color: new Color(1, 1, 1), intensity: 1500 })
  ];

  // let plane = new PlaneGeometry(8, 8);
  // plane.rotateX(Math.PI * 0.5);
  // plane.translate(0, 0, 0);
  // triangles = [...triangles, ...geometryToTriangles(plane, 0)];

  let plane2 = new PlaneGeometry(8, 8);
  // plane2.rotateX(Math.PI * 0.5);
  plane2.translate(0, 0, 4);
  triangles = [...triangles, ...geometryToTriangles(plane2, 0)];

  let lightS = 0.1;
  let light = new PlaneGeometry(lightS, lightS);
  light.rotateX(Math.PI * 0.5);
  light.translate(0, 3, 0);
  triangles = [...triangles, ...geometryToTriangles(light, 1)];

  let lightCs = 3;
  let lightC = new PlaneGeometry(lightCs, lightCs);
  lightC.rotateX(Math.PI * 0.5);
  lightC.translate(0, 2.9, 0);
  triangles = [...triangles, ...geometryToTriangles(lightC, 0)];

  // create & set camera
  const camera = new Orbit();
  camera.set(new Vector3(0, 2, -10), new Vector3(0, 0, 0));
  camera.movementSpeed = 0.15;

  camera.aperture = 0;
  camera.fov = 0.69;
  camera.focusDistance = 9.53;
  camera.exposure = 1.85;

  return { triangles, materials, camera };
}
