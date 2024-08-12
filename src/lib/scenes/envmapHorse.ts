import { Color, Mesh, SphereGeometry, Vector2, Vector3 } from 'three';
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

random.use('test-string' as unknown as RNG);
// random.use(Math.random() as unknown as RNG);
let r = random.float;
let nr = function () {
  return r() * 2 - 1;
};

export async function envmapHorseScene(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse(new Color(0.95, 0.95, 0.95)),
    new Diffuse(new Color(1, 0.05, 0.05)),
    new TorranceSparrow(new Color(0.95, 0.95, 0.95), 0.25, 0.25),
    new Emissive(new Color(1, 0.7, 0.5), 20),
    new Diffuse(new Color(0.05, 1, 0.05)),
    // new Dielectric(new Color(0.135, 0.4, 0.99).multiplyScalar(3), 0.2, 0.2, 1.6),
    // new Dielectric(new Color(0.78, 0.7, 0.678).multiplyScalar(1.5), 0.2, 0.2, 1.6),
    new Dielectric(new Color(0.35, 0.68, 0.99).multiplyScalar(1.85), 0.01, 0.01, 1.6),
    new TorranceSparrow(new Color(0.5, 0.5, 0.5), 0.45, 0.45)
  ];

  // for (let i = 0; i < 5; i++) {
  //   let ps = 4;
  //   let mi = 0;

  //   let raxis = new Vector3(1, 0, 0),
  //     rangle = 0;

  //   if (i == 0) {
  //     mi = 0;
  //   }

  //   if (i == 1) {
  //     raxis = new Vector3(0, 0, 1);
  //     rangle = Math.PI * 0.5;
  //     mi = 1;
  //     continue;
  //   }
  //   if (i == 2) {
  //     raxis = new Vector3(0, 0, 1);
  //     rangle = Math.PI * 1.0;
  //   }

  //   if (i == 3) {
  //     raxis = new Vector3(0, 0, 1);
  //     rangle = Math.PI * 1.5;
  //     mi = 4; // diffuse green
  //   }

  //   if (i == 4) {
  //     raxis = new Vector3(-1, 0, 0);
  //     rangle = Math.PI * 0.5;
  //   }

  //   triangles.push(
  //     new Triangle(
  //       new Vector3(-1, -1, -1).multiplyScalar(ps).applyAxisAngle(raxis, rangle),
  //       new Vector3(-1, -1, +1).multiplyScalar(ps).applyAxisAngle(raxis, rangle),
  //       new Vector3(+1, -1, +1).multiplyScalar(ps).applyAxisAngle(raxis, rangle),
  //       mi
  //     )
  //   );
  //   triangles.push(
  //     new Triangle(
  //       new Vector3(+1, -1, +1).multiplyScalar(ps).applyAxisAngle(raxis, rangle),
  //       new Vector3(-1, -1, -1).multiplyScalar(ps).applyAxisAngle(raxis, rangle),
  //       new Vector3(+1, -1, -1).multiplyScalar(ps).applyAxisAngle(raxis, rangle),
  //       mi
  //     )
  //   );
  // }

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

  let gltf = await new GLTFLoader().loadAsync('scene-assets/models/horse-statue.glb');
  let group = gltf.scene.children[0];

  group.scale.set(-2.7, 2.7, 2.7);
  group.position.set(0.3, -3, 1);
  group.rotation.z = 0.4;

  triangles = [...triangles, ...meshToTriangles(group, 5)];

  let envmap = new Envmap();
  // await envmap.fromEquirect('scene-assets/envmaps/envmap.hdr');
  // await envmap.fromEquirect('scene-assets/envmaps/lebombo_1k.hdr');
  await envmap.fromEquirect('scene-assets/envmaps/large_corridor_1k.hdr');
  envmap.scale = 0.9;
  envmap.rotX = 0.3;

  return { triangles, materials, envmap };
}
