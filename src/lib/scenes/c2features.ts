import {
  Color,
  Matrix4,
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
import { CookTorrance } from '$lib/materials/cookTorrance';
import { Dielectric } from '$lib/materials/dielectric';
import { meshToTriangles } from '$lib/utils/three/meshToTriangles';
import type { C2Scene } from '$lib/createScene';
import { Orbit } from '$lib/controls/Orbit';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Envmap } from '$lib/envmap/envmap';

export async function c2FeaturesScene(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [];

  // let light = new Mesh(new PlaneGeometry(1, 1));
  // light.scale.set(5, 5, 1);
  // light.position.set(0, 5, 0);
  // light.rotation.x = Math.PI * 0.5;
  // materials.push(new Emissive({ color: new Color(0.99, 0.99, 0.99), intensity: 3 }));
  // triangles = [...triangles, ...meshToTriangles(light, materials.length - 1)];

  let plane = new Mesh(new PlaneGeometry(100, 100));
  plane.position.set(0, 0, 0);
  plane.rotation.x = -Math.PI * 0.5;
  // materials.push(new Diffuse({ color: new Color(0.05, 0.05, 0.05) }));
  materials.push(new TorranceSparrow({ color: new Color(0.025, 0.025, 0.025), ax: 0.1, ay: 0.1 }));
  triangles = [...triangles, ...meshToTriangles(plane, materials.length - 1)];

  let gltf = await new GLTFLoader().loadAsync('scene-assets/models/ducati_monster_1200.glb');
  let ducati = gltf.scene.children[0];
  ducati.scale.set(-3, 3, 3);
  ducati.position.set(0, 0, 0);
  // ducati.rotation.set(Math.PI * 0.5, Math.PI, Math.PI * 0.5);
  ducati.traverse((obj) => {
    obj.updateMatrix();
    obj.updateMatrixWorld(true);
  });
  let i = 0;
  ducati.traverse((obj) => {
    if (obj instanceof Mesh) {
      let map = obj.material.map?.source?.data;
      let roughnessMap = obj.material.roughnessMap?.source?.data;
      let color = obj.material.color || new Color(1, 1, 1);
      materials.push(
        new Dielectric({
          absorption: new Color(0.15, 0.35, 0.75).multiplyScalar(10),
          // absorptionMap: map,
          ax: 0.075,
          ay: 0.075,
          eta: 1.6,
          roughnessMap
        })
      );
      // materials.push(new TorranceSparrow({ color, ax: 1, ay: 1, map, roughnessMap }));
      // materials.push(new Diffuse({ color, map }));
      triangles = [...triangles, ...meshToTriangles(obj, materials.length - 1, true, true)];
    }
  });
  // create & set camera
  const camera = new Orbit();
  camera.set(new Vector3(-18.6, 6.6, 8.6), new Vector3(-9.2, 3.9, 4.4));
  camera.movementSpeed = 0.15;

  camera.aperture = 0;
  camera.fov = 0.27;
  camera.focusDistance = 9.53;
  camera.exposure = 1.85;

  let envmap = new Envmap();
  // await envmap.fromEquirect('scene-assets/envmaps/envmap.hdr', 400);
  await envmap.fromEquirect('scene-assets/envmaps/lebombo_1k.hdr');
  // await envmap.fromEquirect('scene-assets/envmaps/large_corridor_1k.hdr');
  envmap.scale = 1;
  envmap.rotX = 0.3;

  return { triangles, materials, camera, envmap };
}
