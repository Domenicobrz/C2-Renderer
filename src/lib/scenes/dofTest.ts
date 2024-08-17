import { Color, CylinderGeometry, Mesh, SphereGeometry, Vector2, Vector3 } from 'three';
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

export async function dofTestScene(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse(new Color(0.95, 0.95, 0.95)),
    new Diffuse(new Color(1, 0.05, 0.05)),
    new TorranceSparrow(new Color(0.95, 0.95, 0.95), 0.25, 0.25),
    new Emissive(new Color(1, 0.7, 0.5), 20),
    new Diffuse(new Color(0.05, 1, 0.05)),
    new Dielectric(new Color(0.35, 0.68, 0.99).multiplyScalar(1.85), 0.01, 0.01, 1.6),
    new TorranceSparrow(new Color(0.5, 0.5, 0.5), 0.45, 0.45)
  ];

  let ps = 100;
  let mi = 6;
  triangles.push(
    new Triangle(
      new Vector3(-1, -3, -1).multiply(new Vector3(ps, 1, ps)),
      new Vector3(-1, -3, +1).multiply(new Vector3(ps, 1, ps)),
      new Vector3(+1, -3, +1).multiply(new Vector3(ps, 1, ps)),
      mi
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(+1, -3, +1).multiply(new Vector3(ps, 1, ps)),
      new Vector3(-1, -3, -1).multiply(new Vector3(ps, 1, ps)),
      new Vector3(+1, -3, -1).multiply(new Vector3(ps, 1, ps)),
      mi
    )
  );

  for (let i = -15; i <= 20; i++) {
    for (let j = -10; j <= 50; j++) {
      let colR = j > 0 && j % 3 === 0 ? 1 : 0;
      let r = Math.random();
      if (colR < 10.5) {
        let col = (noise2D(i * 0.025, j * 0.2 + 3.468195) * 0.5 + 0.5) * 1 + 0;
        materials.push(new Diffuse(new Color(col, col, col)));
      } else {
        let col = Math.pow(Math.random(), 2) * 0.9 + 0.1;
        let roughness = 0.001; // Math.random();
        materials.push(new TorranceSparrow(new Color(col, col, col), roughness, roughness));
      }

      let rad = 0.4;
      let xOff = j % 2 === 0 ? 0 : rad;
      let height = noise2D(i * 0.03 + 3, j * 0.03 + 0.2) * 4 + 4;
      let cyl = new CylinderGeometry(rad, rad, height, 6, 1, false, 0);
      cyl.translate(rad * 1.9 * i + xOff - 2, -3 + height / 2, rad * 1.65 * j);
      triangles = [...triangles, ...geometryToTriangles(cyl, materials.length - 1)];
    }
  }

  // let gltf = await new GLTFLoader().loadAsync('scene-assets/models/horse-statue.glb');
  // let group = gltf.scene.children[0];
  // group.scale.set(-2.7, 2.7, 2.7);
  // group.position.set(0.3, -2.5, 1.5);
  // group.rotation.z = 0.4;
  // triangles = [...triangles, ...meshToTriangles(group, 5)];

  let envmap = new Envmap();
  // await envmap.fromEquirect('scene-assets/envmaps/envmap.hdr');
  // await envmap.fromEquirect('scene-assets/envmaps/lebombo_1k.hdr');
  await envmap.fromEquirect('scene-assets/envmaps/large_corridor_1k.hdr', 300);
  envmap.scale = 0.9;
  envmap.rotX = 0.3;

  // create & set camera
  const orbit = new Orbit();
  orbit.set(new Vector3(0, 1, -10), new Vector3(0, 0, 0));

  return { triangles, materials, envmap, camera: orbit };
}