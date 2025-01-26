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
import { Envmap } from '$lib/envmap/envmap';

export async function envmapSphereScene(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new EONDiffuse({ color: new Color(0.95, 0.95, 0.95), roughness: 1 }),
    new EONDiffuse({ color: new Color(1, 0.05, 0.05), roughness: 1 }),
    // new Diffuse({ color: new Color(0.95, 0.95, 0.95) }),
    // new Diffuse({ color: new Color(1, 0.05, 0.05) }),
    new TorranceSparrow({ color: new Color(0.95, 0.95, 0.95), roughness: 0, anisotropy: 0 }),
    new Emissive({ color: new Color(1, 0.1, 0.1), intensity: 20 }),
    new EONDiffuse({ color: new Color(0.05, 1, 0.05), roughness: 1 }),
    // new Diffuse({ color: new Color(0.05, 1, 0.05) }),
    new Dielectric({
      absorption: new Color(0.095, 0.195, 0.295),
      roughness: 0.05,
      anisotropy: 0,
      eta: 1.5
    })
  ];

  let s = 30;
  let pg = new PlaneGeometry(s, s);
  // pg.rotateY(Math.PI);
  pg.rotateX(-Math.PI * 0.5);
  pg.translate(0, -4, 0);
  triangles = [...triangles, ...geometryToTriangles(pg, 0)];

  const ls = 3;
  let lpg = new PlaneGeometry(ls, ls);
  lpg.rotateX(Math.PI * 0.5);
  lpg.translate(0, 3.9, 0);
  triangles = [...triangles, ...geometryToTriangles(lpg, 3)];

  let mesh = new Mesh(new SphereGeometry(1, 25, 25));
  mesh.scale.set(2, 2, 2);
  mesh.position.set(0, 0, 1);

  let mat = new Diffuse({ color: new Color(1, 1, 1) });
  // let mat = new EONDiffuse({ color: new Color(1, 1, 1), roughness: 1 });
  // let mat = new TorranceSparrow({
  //   color: new Color(0.99, 0.99, 0.99),
  //   roughness: 0.9,
  //   anisotropy: 1
  // });
  // let mat = new Dielectric({
  //   absorption: new Color(0, 0, 0),
  //   roughness: 0.03,
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

  let envmap = new Envmap();
  // await envmap.fromEquirect('scene-assets/envmaps/envmap.hdr');
  // await envmap.fromEquirect('scene-assets/envmaps/lebombo_1k.hdr');
  await envmap.fromEquirect('scene-assets/envmaps/large_corridor_1k.hdr', 300);
  // await envmap.fromEquirect('scene-assets/envmaps/furnace_test.hdr', 100);
  envmap.scale = 0.5;
  envmap.rotX = 5.2;
  envmap.rotY = 0.5;

  // create & set camera
  const camera = new Orbit();
  camera.set(new Vector3(0, 2, -10), new Vector3(0, 0, 0));
  camera.movementSpeed = 0.15;

  camera.aperture = 0;
  camera.fov = 0.69;
  camera.focusDistance = 9.53;
  camera.exposure = 1.85;

  return { triangles, materials, camera, envmap };
}
