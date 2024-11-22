import { Color, Mesh, PlaneGeometry, SphereGeometry, TextureLoader, Vector2, Vector3 } from 'three';
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
import { GLTFLoader } from 'three/examples/jsm/Addons.js';
import { geometryToTriangles } from '$lib/utils/three/geometryToTriangles';
import { EONDiffuse } from '$lib/materials/EONDiffuse';

export async function cornellSphereScene(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new EONDiffuse({ color: new Color(0.95, 0.95, 0.95), roughness: 1 }),
    new EONDiffuse({ color: new Color(1, 0.05, 0.05), roughness: 1 }),
    // new Diffuse({ color: new Color(0.95, 0.95, 0.95) }),
    // new Diffuse({ color: new Color(1, 0.05, 0.05) }),
    new TorranceSparrow({ color: new Color(0.95, 0.95, 0.95), roughness: 0, anisotropy: 0 }),
    new Emissive({ color: new Color(1, 1, 1), intensity: 20 }),
    new EONDiffuse({ color: new Color(0.05, 1, 0.05), roughness: 1 }),
    // new Diffuse({ color: new Color(0.05, 1, 0.05) }),
    new Dielectric({
      absorption: new Color(0.095, 0.195, 0.295),
      roughness: 0.05,
      anisotropy: 0,
      eta: 1.5
    })
  ];

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
      mi = 4;
    }
    if (i == 4) {
      pg.rotateY(-Math.PI * 0.5);
      mi = 1;
    }

    triangles = [...triangles, ...geometryToTriangles(pg, mi)];
  }

  const ls = 1;
  let lpg = new PlaneGeometry(ls, ls);
  lpg.rotateX(Math.PI * 0.5);
  lpg.translate(0, 3.9, 0);
  triangles = [...triangles, ...geometryToTriangles(lpg, 3)];

  let mesh = new Mesh(new SphereGeometry(1, 25, 25));
  mesh.scale.set(2, 2, 2);
  mesh.position.set(0, 0, 1);

  // let mat = new Diffuse({ color: new Color(1, 1, 1) });
  let mat = new EONDiffuse({ color: new Color(1, 1, 1), roughness: 1 });
  // let mat = new TorranceSparrow({
  //   color: new Color(0.99, 0.99, 0.99),
  //   roughness: 0.9,
  //   anisotropy: 1
  // });
  // let mat = new Dielectric({
  //   absorption: new Color(0, 0, 0),
  //   roughness: 0.9,
  //   anisotropy: 0,
  //   eta: 1.5
  // });
  materials.push(mat);
  triangles = [...triangles, ...meshToTriangles(mesh, materials.length - 1)];

  // let gltf = await new GLTFLoader().loadAsync('scene-assets/models/horse-statue-uv.glb');
  // let group = gltf.scene.children[0];
  // group.scale.set(-2.85, 2.85, 2.85);
  // group.position.set(0.1, -4, 1.5);
  // group.rotation.z = 0.4;
  // triangles = [...triangles, ...meshToTriangles(group, materials.length - 1)];

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
