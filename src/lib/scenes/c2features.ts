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

export async function c2FeaturesScene(): Promise<C2Scene> {
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
      color: new Color(0.5, 0.5, 0.5),
      ax: 0.151,
      ay: 0.151,
      map: gcDiff,
      roughnessMap: gcRough,
      bumpMap: gcBump,
      bumpStrength: 4.35,
      uvRepeat: new Vector2(20, 20),
      mapUvRepeat: new Vector2(20, 20)
    })
  );
  triangles = [...triangles, ...meshToTriangles(plane, materials.length - 1)];

  let graffiti = new Mesh(new PlaneGeometry(35, 15));
  graffiti.position.set(20, 7.25, -7.5);
  graffiti.rotation.y = Math.PI * 0.7;
  let graffitiTexture = (await new TextureLoader().loadAsync('scene-assets/textures/graff.png'))
    .source.data;
  let graffitiTexture2 = (await new TextureLoader().loadAsync('scene-assets/textures/graff-2.png'))
    .source.data;
  let wallBump = (await new TextureLoader().loadAsync('scene-assets/textures/bump-test.png')).source
    .data;
  materials.push(
    new Diffuse({
      color: new Color(0.9, 0.9, 0.9),
      map: graffitiTexture2,
      bumpMap: wallBump,
      bumpStrength: 5,
      mapUvRepeat: new Vector2(1.3, 1.3),
      uvRepeat: new Vector2(2.25, 1.5)
    })
  );
  triangles = [...triangles, ...meshToTriangles(graffiti, materials.length - 1)];

  // let gltf = await new GLTFLoader().loadAsync('scene-assets/models/ducati_monster_1200.glb');
  // let ducati = gltf.scene.children[0];
  // ducati.scale.set(-3, 3, 3);
  // ducati.position.set(-1, 0, -1);
  // // ducati.rotation.set(Math.PI * 0.5, Math.PI, Math.PI * 0.5);
  // ducati.traverse((obj) => {
  //   obj.updateMatrix();
  //   obj.updateMatrixWorld(true);
  // });
  // let i = 0;
  // ducati.traverse((obj) => {
  //   if (obj instanceof Mesh) {
  //     let map = obj.material.map?.source?.data;
  //     let roughnessMap = obj.material.roughnessMap?.source?.data;
  //     let color = obj.material.color || new Color(1, 1, 1);
  //     materials.push(
  //       new Dielectric({
  //         absorption: new Color(0.15, 0.35, 0.75).multiplyScalar(10),
  //         // absorptionMap: map,
  //         ax: 0.075,
  //         ay: 0.075,
  //         eta: 1.6,
  //         roughnessMap,
  //         flipTextureY: true
  //       })
  //     );

  //     // materials.push(new TorranceSparrow({ color, ax: 0.1, ay: 0.1, map, roughnessMap }));
  //     // materials.push(new Diffuse({ color, map, flipTextureY: true }));
  //     triangles = [...triangles, ...meshToTriangles(obj, materials.length - 1, true)];
  //   }
  // });

  let gltf = await new GLTFLoader().loadAsync('scene-assets/models/horse-statue-uv.glb');
  let group = gltf.scene.children[0];
  group.scale.set(-2.15, 2.15, 2.15);
  group.position.set(-0.5, 0, -1.5);
  group.rotation.z = -1.4;
  materials.push(
    new Dielectric({
      absorption: new Color(0.25, 0.58, 0.99).multiplyScalar(4.5),
      ax: 0.01,
      ay: 0.01,
      eta: 1.6
    })
  );
  triangles = [...triangles, ...meshToTriangles(group, materials.length - 1)];

  let sphereGeo = new SphereGeometry(2, 75, 75);
  sphereGeo.translate(2, 2, 1);
  materials.push(
    new TorranceSparrow({
      color: new Color(1, 1, 1),
      map: graffitiTexture,
      ax: 0.1,
      ay: 0.01
    })
  );
  triangles = [
    ...triangles,
    ...geometryToTriangles(sphereGeo, materials.length - 1, new Matrix4().identity())
  ];

  const camera = new Orbit();
  camera.set(new Vector3(-12.3, 5.4, 5.3), new Vector3(-2.8, 2.6, 1.3));

  camera.movementSpeed = 0.15;

  camera.aperture = 0.17;
  camera.fov = 0.53;
  camera.focusDistance = 13.246386264701139;
  camera.exposure = 1.85;

  let envmap = new Envmap();
  // await envmap.fromEquirect('scene-assets/envmaps/envmap.hdr', 400);
  await envmap.fromEquirect('scene-assets/envmaps/lebombo_1k.hdr');
  // await envmap.fromEquirect('scene-assets/envmaps/large_corridor_1k.hdr');
  envmap.scale = 1;
  envmap.rotX = 5.5;
  envmap.rotY = 1.7;

  return { triangles, materials, camera, envmap };
}
