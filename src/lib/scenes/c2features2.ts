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
import type { Material } from './../materials/material';
import { Triangle } from './../primitives/triangle';
import { TorranceSparrow } from './../materials/torranceSparrow';
import { Dielectric } from '$lib/materials/dielectric';
import { meshToTriangles } from '$lib/utils/three/meshToTriangles';
import type { C2Scene } from '$lib/createScene';
import { Orbit } from '$lib/controls/Orbit';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Envmap } from '$lib/envmap/envmap';
import { geometryToTriangles } from '$lib/utils/three/geometryToTriangles';

export async function c2Features2Scene(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [];

  let plane = new Mesh(new PlaneGeometry(100, 100));
  plane.position.set(0, 0, 0);
  plane.rotation.x = -Math.PI * 0.5;
  let gcDiff = (await new TextureLoader().loadAsync('scene-assets/textures/grey-cartago/diff.png'))
    .source.data;
  let gcBump = (await new TextureLoader().loadAsync('scene-assets/textures/grey-cartago/disp.png'))
    .source.data;
  let gcRough = (
    await new TextureLoader().loadAsync('scene-assets/textures/grey-cartago/rough.png')
  ).source.data;
  materials.push(
    new TorranceSparrow({
      // color: new Color(0.35, 0.35, 0.35),
      // color: new Color(0.175, 0.165, 0.15),
      color: new Color(0.075, 0.065, 0.05),
      roughness: 0.95,
      anisotropy: 0
      // map: gcDiff,
      // roughnessMap: gcRough,
      // bumpMap: gcBump,
      // bumpStrength: 4.35,
      // uvRepeat: new Vector2(10, 10),
      // mapUvRepeat: new Vector2(10, 10)
    })
  );
  // triangles = [...triangles, ...meshToTriangles(plane, materials.length - 1)];

  let gltfCyclo = await new GLTFLoader().loadAsync('scene-assets/models/3d-cyclorama.glb');
  let cyclorama = gltfCyclo.scene.children[0];
  cyclorama.scale.set(38, 38, 38);
  cyclorama.position.set(40, 0, -33);
  cyclorama.rotation.y = 4.35;
  triangles = [...triangles, ...meshToTriangles(cyclorama, materials.length - 1)];

  let gltf = await new GLTFLoader().loadAsync('scene-assets/models/ducati_monster_1200.glb');
  let ducati = gltf.scene.children[0];
  ducati.scale.set(-3, 3, 3);
  ducati.position.set(-1, 0, -1);
  // ducati.rotation.set(Math.PI * 0.5, Math.PI, Math.PI * 0.5);
  ducati.traverse((obj: any) => {
    obj.updateMatrix();
    obj.updateMatrixWorld(true);
  });
  let i = 0;
  ducati.traverse((obj: any) => {
    if (obj instanceof Mesh) {
      let map = obj.material.map?.source?.data;
      let roughnessMap = obj.material.roughnessMap?.source?.data;
      let color = obj.material.color || new Color(1, 1, 1);

      // i == 51, 52 -> tires
      // i == 17 -> forks
      // i == 29 -> fanalino
      // i == 5, 6 -> cerchioni

      let absorptionFactor = 10;
      if (i == 29) {
        // fanalino
        absorptionFactor = 20;
      }
      if (i == 5 || i == 6) {
        // cerchioni
        absorptionFactor = 30;
      }
      if (i == 51) {
        // back tire
        absorptionFactor = 75;
      }
      if (i == 52) {
        // front tire
        absorptionFactor = 100;
      }
      if (i == 17) {
        // forks
        absorptionFactor = 55;
      }

      let r = 0.15;
      let g = 0.35;
      let b = 0.75;

      // if (Math.random() > 0.8) {
      //   // r = 1;
      //   // g = 0.33;
      //   // b = 0;

      //   r = 0.85;
      //   g = 0.37;
      //   b = 0.07;
      // }

      materials.push(
        new Dielectric({
          // absorption: new Color(0.15, 0.35, 0.75).multiplyScalar(absorptionFactor),
          absorption: new Color(r, g, b).multiplyScalar(absorptionFactor),
          // absorptionMap: map,
          // roughness: 0.1,
          roughness: 0.8,
          anisotropy: 0,
          eta: 1.5,
          // roughnessMap,
          flipTextureY: true
        })
      );

      // if (i > 4 && i <= 5) {
      // if (i == 17) {
      // materials.push(new TorranceSparrow({ color, ax: 0.1, ay: 0.1, map, roughnessMap }));
      // materials.push(new Diffuse({ color, map, flipTextureY: true }));
      triangles = [...triangles, ...meshToTriangles(obj, materials.length - 1, true)];
      // }
      i++;
    }
  });

  const camera = new Orbit();
  camera.set(new Vector3(-18.6, 2.4, 8.9), new Vector3(-9.3, 2.0, 3.8));

  camera.movementSpeed = 0.15;

  camera.aperture = 0.035;
  camera.fov = 0.27;
  camera.focusDistance = 19.228981692834083;
  camera.exposure = 1.85;

  let envmap = new Envmap();
  // await envmap.fromEquirect('scene-assets/envmaps/envmap.hdr', 400);
  await envmap.fromEquirect('scene-assets/envmaps/lebombo_1k.hdr');
  // await envmap.fromEquirect('scene-assets/envmaps/large_corridor_1k.hdr');
  envmap.scale = 1;
  envmap.rotX = 0.7;
  // envmap.rotY = 0;
  envmap.rotY = 2.2;
  // envmap.rotY = 2.7;

  return { triangles, materials, camera, envmap };
}
