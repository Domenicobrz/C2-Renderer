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

random.use('test-string' as unknown as RNG);
// random.use(Math.random() as unknown as RNG);
let r = random.float;
let nr = function () {
  return r() * 2 - 1;
};

export async function ReSTIRTest2Scene(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse({ color: new Color(0.95, 0.95, 0.95) }),
    new Diffuse({ color: new Color(1, 0.05, 0.05) }),
    new Diffuse({ color: new Color(0.05, 1, 0.05) }),
    new Emissive({ color: new Color(1, 1, 1), intensity: 30 })
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
      mi = 2;
    }
    if (i == 4) {
      pg.rotateY(-Math.PI * 0.5);
      mi = 1;
    }

    triangles = [...triangles, ...geometryToTriangles(pg, mi)];
  }

  for (let i = 0; i < 3050; i++) {
    let ps = r() * 0.75 + 0.15;
    let lpg = new PlaneGeometry(ps, ps);
    lpg.rotateX(r() * Math.PI * 2);
    lpg.rotateY(r() * Math.PI * 2);
    lpg.rotateZ(r() * Math.PI * 2);
    lpg.translate(nr() * 5, nr() * 5, nr() * 5);

    triangles = [...triangles, ...geometryToTriangles(lpg, 0)];
  }

  for (let i = 0; i < 200; i++) {
    const rad = 0.003;
    let lpg = new SphereGeometry(rad, 3, 3);
    lpg.translate(nr() * 5, nr() * 5, nr() * 5);
    materials.push(new Emissive({ color: new Color(r(), r(), r()), intensity: 5000 }));
    triangles = [...triangles, ...geometryToTriangles(lpg, materials.length - 1)];
  }

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
