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

export async function envmapHorseScene(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse({ color: new Color(0.95, 0.95, 0.95) }),
    new Diffuse({ color: new Color(1, 0.05, 0.05) }),
    new TorranceSparrow({ color: new Color(0.95, 0.95, 0.95), roughness: 0.25, anisotropy: 0 }),
    new Emissive({ color: new Color(1, 0.7, 0.5), intensity: 20 }),
    new Diffuse({ color: new Color(0.05, 1, 0.05) }),
    new Dielectric({
      absorption: new Color(0.35, 0.68, 0.99).multiplyScalar(1.85),
      roughness: 0.85,
      // roughness: 0.01,
      anisotropy: 0,
      eta: 1.6
    }),
    new TorranceSparrow({ color: new Color(0.5, 0.5, 0.5), roughness: 0.45, anisotropy: 0 })
  ];

  let gty = -2;

  let ps = 100;
  let mi = 6;
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

  for (let i = -15; i <= 20; i++) {
    for (let j = -5; j <= 50; j++) {
      let colR = j > 0 && j % 3 === 0 ? 1 : 0;
      if (colR < 99999) {
        let col = (noise2D(i * 0.025, j * 0.2 + 3.468195) * 0.5 + 0.5) * 0.7 + 0.3;
        materials.push(new Diffuse({ color: new Color(col, col, col) }));
      } else {
        let col = Math.pow(Math.random(), 2) * 0.9 + 0.1;
        let roughness = 0.001; // Math.random();
        materials.push(
          new TorranceSparrow({ color: new Color(col, col, col), roughness, anisotropy: 0 })
        );
      }

      let rad = 0.4;
      let xOff = j % 2 === 0 ? 0 : rad;
      let height = noise2D(i * 0.03 + 3, j * 0.03 + 0.35) * 8 + 8;
      let cyl = new CylinderGeometry(rad, rad, height, 6, 1, false, 0);
      cyl.translate(rad * 1.9 * i + xOff - 2, -3 + height / 2 + gty, rad * 1.65 * j);
      // triangles = [...triangles, ...geometryToTriangles(cyl, materials.length - 1)];
    }
  }

  let gltf = await new GLTFLoader().loadAsync('scene-assets/models/horse-statue.glb');
  let group = gltf.scene.children[0];
  group.scale.set(-2.7, 2.7, 2.7);
  group.position.set(0.3, -1.25 + gty, 1.5);
  group.rotation.z = 0.4;
  triangles = [...triangles, ...meshToTriangles(group, 5)];

  let envmap = new Envmap();
  // await envmap.fromEquirect('scene-assets/envmaps/envmap.hdr');
  // await envmap.fromEquirect('scene-assets/envmaps/lebombo_1k.hdr');
  // await envmap.fromEquirect('scene-assets/envmaps/large_corridor_1k.hdr', 300);
  await envmap.fromEquirect('scene-assets/envmaps/furnace_test.hdr', 100);
  envmap.scale = 0.9;
  envmap.rotX = 5.2;
  envmap.rotY = 0.5;

  // create & set camera
  const camera = new Orbit();
  camera.set(new Vector3(0, 4, -10), new Vector3(0, 0, 0));
  camera.movementSpeed = 0.15;

  camera.fov = 0.69;
  camera.aperture = 0.25;
  camera.focusDistance = 11.185065325218906;
  camera.exposure = 1.85;

  return { triangles, materials, envmap, camera };
}
