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
import { GLTFLoader } from 'three/examples/jsm/Addons.js';
import { Dielectric } from '$lib/materials/dielectric';

random.use('test-string' as unknown as RNG);
// random.use(Math.random() as unknown as RNG);
let r = random.float;
let nr = function () {
  return r() * 2 - 1;
};

export async function ReSTIRTest3Scene(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse({ color: new Color(0.95, 0.95, 0.95) }),
    new Diffuse({ color: new Color(1, 0.05, 0.05) }),
    new Diffuse({ color: new Color(0.05, 1, 0.05) }),
    new Emissive({ color: new Color(1, 1, 1), intensity: 250 }),
    // new Emissive({ color: new Color(1, 1, 1), intensity: 5 }),
    // new Emissive({ color: new Color(1, 1, 1), intensity: 0.5 })
    new Diffuse({ color: new Color(0.95, 0.95, 0.95) }),
    // new Diffuse({ color: new Color(0.95, 0.95, 0.95) })
    new Dielectric({ absorption: new Color(0, 0, 0), roughness: 0.03, anisotropy: 0, eta: 1.55 })
    // new TorranceSparrow({ color: new Color(0.95, 0.95, 0.95), roughness: 0.03, anisotropy: 0 })
  ];

  // let plane = new PlaneGeometry(8, 8);
  // plane.rotateX(Math.PI * 0.5);
  // plane.translate(0, 0, 0);
  // triangles = [...triangles, ...geometryToTriangles(plane, 0)];

  for (let i = 0; i < 5; i++) {
    let s = 8;
    let pg = new PlaneGeometry(s, s);
    pg.translate(0, 0, -s * 0.5);
    let mi = 0;

    if (i == 0) {
      pg.rotateY(Math.PI);
      pg.rotateX(0);
    }
    if (i == 1) {
      pg.rotateY(Math.PI);
      pg.rotateX(Math.PI * 0.5);
    }
    if (i == 2) {
      pg.rotateY(Math.PI);
      pg.rotateX(-Math.PI * 0.5);
    }
    if (i == 3) {
      pg.rotateY(Math.PI * 0.5);
      mi = 2;
    }
    if (i == 4) {
      pg.rotateY(-Math.PI * 0.5);
      mi = 1;
    }

    triangles = [...triangles, ...geometryToTriangles(pg, mi)];
  }

  // let lightS = 2.8;
  let lightS = 0.28;
  let light = new PlaneGeometry(lightS, lightS);
  light.rotateX(Math.PI * 0.5);
  light.translate(3, 3.9, 0);
  triangles = [...triangles, ...geometryToTriangles(light, 3)];

  // let lightSC = 4.3;
  // let lightC = new PlaneGeometry(lightSC, lightSC);
  // lightC.rotateX(Math.PI * 0.5);
  // lightC.translate(3, 3.5, 0);
  // triangles = [...triangles, ...geometryToTriangles(lightC, 0)];

  // let lightCs = 3;
  // let lightC = new PlaneGeometry(lightCs, lightCs);
  // lightC.rotateX(Math.PI * 0.5);
  // lightC.translate(0, 2.9, 0);
  // triangles = [...triangles, ...geometryToTriangles(lightC, 0)];

  let gltf = await new GLTFLoader().loadAsync('scene-assets/models/horse-statue.glb');
  let group = gltf.scene.children[0];
  group.scale.set(-2.7, 2.7, 2.7);
  group.position.set(0.3, -1.25 - 2, 1.5);
  group.rotation.z = 0.4;
  triangles = [...triangles, ...meshToTriangles(group, 0)];

  // create & set camera
  const camera = new Orbit();
  camera.set(new Vector3(0, 2, -10), new Vector3(0, 0, 0));
  camera.movementSpeed = 0.15;

  camera.aperture = 0;
  camera.fov = 0.69;
  camera.focusDistance = 9.53;
  camera.exposure = 1;

  return { triangles, materials, camera };
}
