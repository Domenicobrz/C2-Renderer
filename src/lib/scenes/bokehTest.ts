import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Mesh,
  PlaneGeometry,
  SphereGeometry,
  Vector2,
  Vector3
} from 'three';
import { Diffuse } from '../materials/diffuse';
import { Emissive } from './../materials/emissive';
import type { Material } from './../materials/material';
import { Triangle } from './../primitives/triangle';
import { TorranceSparrow } from './../materials/torranceSparrow';
import random, { RNG } from 'random';
import { CookTorrance } from '$lib/materials/cookTorrance';
import { Dielectric } from '$lib/materials/dielectric';
import { meshToTriangles } from '$lib/utils/three/meshToTriangles';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import type { C2Scene } from '$lib/createScene';
import { Envmap } from '$lib/envmap/envmap';
import { geometryToTriangles } from '$lib/utils/three/geometryToTriangles';
import { createNoise2D } from 'simplex-noise';
import alea from 'alea';
import { Orbit } from '$lib/controls/Orbit';

const prng = alea('seed');
const noise2D = createNoise2D(prng);

random.use('test-string' as unknown as RNG);
// random.use(Math.random() as unknown as RNG);
let r = random.float;
let nr = function () {
  return r() * 2 - 1;
};

export async function bokehTestScene(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse(new Color(0.95, 0.95, 0.95)),
    new Diffuse(new Color(1, 0.05, 0.05)),
    new TorranceSparrow(new Color(0.95, 0.95, 0.95), 0.25, 0.25),
    new Emissive(new Color(1, 0.7, 0.5), 50),
    new Diffuse(new Color(0.05, 1, 0.05)),
    new Dielectric(new Color(0.35, 0.68, 0.99).multiplyScalar(1.85), 0.01, 0.01, 1.6),
    // new Diffuse(new Color(0.05, 0.05, 0.05)),
    new TorranceSparrow(new Color(0.5, 0.5, 0.5), 0.45, 0.45)
  ];

  let gty = -2;

  let ps = 100;
  let mi = 0;
  triangles.push(
    new Triangle(
      new Vector3(-1, -3, -1).multiply(new Vector3(ps, 1, ps)).add(new Vector3(0, gty, 0)),
      new Vector3(-1, -3, +1).multiply(new Vector3(ps, 1, ps)).add(new Vector3(0, gty, 0)),
      new Vector3(+1, -3, +1).multiply(new Vector3(ps, 1, ps)).add(new Vector3(0, gty, 0)),
      mi
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(+1, -3, +1).multiply(new Vector3(ps, 1, ps)).add(new Vector3(0, gty, 0)),
      new Vector3(-1, -3, -1).multiply(new Vector3(ps, 1, ps)).add(new Vector3(0, gty, 0)),
      new Vector3(+1, -3, -1).multiply(new Vector3(ps, 1, ps)).add(new Vector3(0, gty, 0)),
      mi
    )
  );

  for (let i = 0; i <= 100; i++) {
    let sphereGeo = new SphereGeometry(0.1, 5, 5);
    sphereGeo.translate(nr() * 22, r() * 13 - 5, 10 + r() * 40);
    triangles = [...triangles, ...geometryToTriangles(sphereGeo, 3)];
  }

  // let gltf = await new GLTFLoader().loadAsync('scene-assets/models/horse-statue.glb');
  // let group = gltf.scene.children[0];
  // group.scale.set(-2.7, 2.7, 2.7);
  // group.position.set(0.3, -1.25 + gty, 1.5);
  // group.rotation.z = 0.4;
  // triangles = [...triangles, ...meshToTriangles(group, 5)];

  // let envmap = new Envmap();
  // // await envmap.fromEquirect('scene-assets/envmaps/envmap.hdr');
  // // await envmap.fromEquirect('scene-assets/envmaps/lebombo_1k.hdr');
  // await envmap.fromEquirect('scene-assets/envmaps/large_corridor_1k.hdr', 300);
  // envmap.scale = 0.9;
  // envmap.rotX = 5.2;
  // envmap.rotY = 0.5;

  // create & set camera
  const camera = new Orbit();
  camera.set(new Vector3(0, 1, -10), new Vector3(0, 0, 0));
  camera.movementSpeed = 0.15;

  camera.fov = 0.69;
  camera.aperture = 0.85;
  camera.focusDistance = 11.134;
  camera.exposure = 1.85;
  // camera.fov = 0.7853981633974483;
  // camera.aperture = 0.05;
  // camera.focusDistance = 19.271073071897735;

  // return { triangles, materials, camera, envmap };
  return { triangles, materials, camera };
}
