import {
  BoxGeometry,
  Color,
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
import { meshToTriangles } from '$lib/utils/three/meshToTriangles';
import type { C2Scene } from '$lib/createScene';
import { Orbit } from '$lib/controls/Orbit';
import { geometryToTriangles } from '$lib/utils/three/geometryToTriangles';
import { TorranceSparrow } from '$lib/materials/torranceSparrow';
import random, { RNG } from 'random';
import { BufferGeometryUtils, GLTFLoader } from 'three/examples/jsm/Addons.js';
import { Dielectric } from '$lib/materials/dielectric';

random.use('test-string' as unknown as RNG);
// random.use(Math.random() as unknown as RNG);
let r = random.float;
let nr = function () {
  return r() * 2 - 1;
};

function createOpenBoxGeometry(width: number, height: number, depth: number) {
  const w = width;
  const h = height;
  const d = depth;

  const geometries = [];

  const frontPlane = new PlaneGeometry(w, h);
  const backPlane = new PlaneGeometry(w, h);
  const leftPlane = new PlaneGeometry(d, h);
  const rightPlane = new PlaneGeometry(d, h);
  const topPlane = new PlaneGeometry(w, d);

  frontPlane.translate(0, 0, d / 2);

  backPlane.rotateY(Math.PI);
  backPlane.translate(0, 0, -d / 2);

  leftPlane.rotateY(-Math.PI / 2);
  leftPlane.translate(-w / 2, 0, 0);

  rightPlane.rotateY(Math.PI / 2);
  rightPlane.translate(w / 2, 0, 0);

  topPlane.rotateX(-Math.PI / 2);
  topPlane.translate(0, h / 2, 0);

  geometries.push(frontPlane, backPlane, leftPlane, rightPlane, topPlane);

  const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries, false);

  mergedGeometry.translate(0, -h / 2, 0);
  geometries.forEach((geom) => geom.dispose());

  return mergedGeometry;
}

export async function ReSTIRStressTestScene(): Promise<C2Scene> {
  let cornellBoxLuminosity = 0.55;

  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse({ color: new Color(0.95, 0.95, 0.95).multiplyScalar(cornellBoxLuminosity) }),
    new Diffuse({ color: new Color(1, 0.05, 0.05).multiplyScalar(cornellBoxLuminosity) }),
    new TorranceSparrow({ color: new Color(0.75, 0.75, 0.75), roughness: 0.25, anisotropy: 0 }),
    new Emissive({ color: new Color(1, 1, 1), intensity: 2000 }),
    // new EONDiffuse({ color: new Color(0.05, 1, 0.05), roughness: 1 }),
    new Diffuse({ color: new Color(0.05, 1, 0.05).multiplyScalar(cornellBoxLuminosity) }),
    new Diffuse({ color: new Color(0.15, 0.15, 0.15) }),
    new Dielectric({
      absorption: new Color(0.35, 0.68, 0.99).multiplyScalar(0.5),
      roughness: 0.05,
      anisotropy: 0,
      eta: 1.6
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

  // let gltf = await new GLTFLoader().loadAsync(globals.assetsPath + 'models/horse-statue.glb');
  let gltf = await new GLTFLoader().loadAsync(
    'scene-assets-TO-REMOVE/models/stanford-xyz-dragon-low-res.glb'
  );
  let mesh = gltf.scene.children[0];
  mesh.scale.set(0.0425, 0.0425, 0.0425);
  mesh.position.set(-0.2, 0, 1);
  mesh.rotation.z = -0.5;
  materials.push(new Diffuse({ color: new Color(0.975, 0.975, 0.975) }));
  triangles = [...triangles, ...meshToTriangles(mesh, materials.length - 1)];

  let pc = 4;
  for (let i = 0; i < pc; i++) {
    let s = 8;
    let tStep = 8 / (pc + 1);
    let x = -4 + tStep * (i + 1);
    let pg = new PlaneGeometry(s, s);
    pg.rotateY(Math.PI * 0.5);
    pg.translate(x, 0, 0);

    // triangles = [...triangles, ...geometryToTriangles(pg, 5)];
  }
  for (let i = 0; i < pc; i++) {
    let s = 8;
    let tStep = 8 / (pc + 1);
    let y = -4 + tStep * (i + 1);
    let pg = new PlaneGeometry(s, s);
    pg.rotateX(Math.PI * 0.5);
    pg.translate(0, y, 0);

    // triangles = [...triangles, ...geometryToTriangles(pg, 5)];
  }

  for (let i = -30; i <= +30; i++) {
    for (let j = -30; j <= +30; j++) {
      let t = new Vector3(i, j).multiplyScalar(0.125);
      // let tm = 20;
      // let rt = new Vector3(nr() * tm, nr() * tm, nr() * tm);
      // let rr = new Vector3(nr(), nr(), nr());

      const color = new Color();
      // const hue = r();
      // const hue = (i * 0.0675 + 0.5) % 1;
      const hue = (i * 0.0675 + j * 0.015 + 0.5) % 1;
      const saturation = 1.0;
      const lightness = 0.5;
      color.setHSL(hue, saturation, lightness);
      // color.add(new Color(0.05, 0.05, 0.05));
      color.convertSRGBToLinear().convertSRGBToLinear().convertSRGBToLinear();
      // let color = new Color(1, 1, 1);
      // let cr = r();
      // if (cr > 0.333) {
      //   color = new Color(1, 0.1, 0.1);
      // }
      // if (cr > 0.667) {
      //   color = new Color(1, 0.75, 0.35);
      // }

      let intensity = 137;

      let emissiveMaterial = new Emissive({ color, intensity });
      materials.push(emissiveMaterial);
      let matIndex = materials.length - 1;

      let lightS = 0.065;
      let light = new PlaneGeometry(lightS, lightS);
      light.rotateX(Math.PI * 0.5);
      // light.rotateX(rr.x);
      // light.rotateZ(rr.z);
      // light.rotateY(rr.y);
      // light.translate(rt.x, rt.y, rt.z);
      light.translate(t.x, 3, t.y);
      triangles.push(...geometryToTriangles(light, matIndex));

      // let coverHeight = 0.275;
      // let coverHeight = 0.02;

      // let cubeGeo = createOpenBoxGeometry(lightS + 0.001, coverHeight, lightS + 0.001);
      // // cubeGeo.translate(t.x, 3.01, t.y);
      // cubeGeo.rotateX(rr.x);
      // cubeGeo.rotateZ(rr.z);
      // cubeGeo.rotateY(rr.y);
      // cubeGeo.translate(rt.x, rt.y, rt.z);
      // triangles = [...triangles, ...geometryToTriangles(cubeGeo, 0)];
    }
  }

  let coverYpos = 2.5;
  let coverSize = 3.925;
  let lightCoverLeft = new PlaneGeometry(coverSize, 8);
  lightCoverLeft.rotateX(Math.PI * 0.5);
  lightCoverLeft.translate(-coverSize * 0.5 - (4 - coverSize), coverYpos, 0);
  triangles = [...triangles, ...geometryToTriangles(lightCoverLeft, 0)];
  lightCoverLeft.translate(0, 0.001, 0);
  triangles = [...triangles, ...geometryToTriangles(lightCoverLeft, 0)];

  let lightCoverRight = new PlaneGeometry(coverSize, 8);
  lightCoverRight.rotateX(Math.PI * 0.5);
  lightCoverRight.translate(coverSize * 0.5 + (4 - coverSize), coverYpos, 0);
  triangles = [...triangles, ...geometryToTriangles(lightCoverRight, 0)];
  lightCoverRight.translate(0, 0.001, 0);
  triangles = [...triangles, ...geometryToTriangles(lightCoverRight, 0)];

  let bottomBox = new BoxGeometry(6, 0.175, 6);
  bottomBox.translate(0.2, -1.8, 1.9);
  materials.push(
    new TorranceSparrow({ color: new Color(0.65, 0.65, 0.65), roughness: 0.25, anisotropy: 0 })
  );
  triangles = [...triangles, ...geometryToTriangles(bottomBox, materials.length - 1)];

  let bottomBoxSupport = new BoxGeometry(1.3, 3, 1.3);
  bottomBoxSupport.translate(0.1, -3.3, 1.35);
  triangles = [...triangles, ...geometryToTriangles(bottomBoxSupport, 0)];

  // create & set camera
  const camera = new Orbit();
  camera.set(new Vector3(0, 2, -10), new Vector3(0, 0, 0));
  // camera.set(new Vector3(1.2, 1.5, -41.5), new Vector3(0.9, 1.1, -31.3));
  camera.movementSpeed = 0.15;

  camera.aperture = 0;
  camera.fov = 0.69;
  // camera.fov = 0.15;
  camera.focusDistance = 9.53;
  camera.exposure = 1.85;

  function dispose() {}

  return { triangles, materials, camera, dispose };
}
