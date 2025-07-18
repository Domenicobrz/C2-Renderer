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
import { Dielectric } from '$lib/materials/dielectric';
import { Envmap } from '$lib/envmap/envmap';
import { globals } from '$lib/C2';

export async function ReSTIREnvmapScene(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse({ color: new Color(0.95, 0.95, 0.95) }),
    new Diffuse({ color: new Color(1, 0.05, 0.05) }),
    new Diffuse({ color: new Color(0.05, 1, 0.05) }),
    // new Emissive({ color: new Color(1, 1, 1), intensity: 5000 })
    new Emissive({ color: new Color(1, 1, 1), intensity: 30 })
    // new Emissive({ color: new Color(1, 1, 1), intensity: 0.5 })
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

  // // const ls = 10;
  // const ls = 1;
  // // const ls = 0.05;
  // let lpg = new PlaneGeometry(ls, ls);
  // lpg.rotateX(Math.PI * 0.5);
  // lpg.translate(0, 3.9, 0);
  // // lpg.translate(0, 2, 0);
  // triangles = [...triangles, ...geometryToTriangles(lpg, 3)];

  let mesh = new Mesh(new BoxGeometry(3, 5, 3));
  mesh.position.set(0, -2, 1.5);
  mesh.rotation.y = -0.5;

  // let mesh = new Mesh(new PlaneGeometry(4, 4));
  // mesh.position.set(0, -2, 0);

  // let mat = new Diffuse({ color: new Color(1, 1, 1) });
  // let mat = new TorranceSparrow({ color: new Color(1, 1, 1), roughness: 0.05, anisotropy: 0 });
  // let mat = new Dielectric({
  //   absorption: new Color(0, 0, 0),
  //   roughness: 0.095,
  //   anisotropy: 0,
  //   eta: 1.55
  // });
  // materials.push(mat);
  // triangles = [...triangles, ...meshToTriangles(mesh, materials.length - 1)];

  // // light mesh cover
  // const lsc = 3;
  // let lcpg = new PlaneGeometry(lsc, lsc);
  // lcpg.rotateX(Math.PI * 0.5);
  // // lcpg.translate(0, 3.65, 0);
  // lcpg.translate(0, 2.1, 0);
  // triangles = [...triangles, ...geometryToTriangles(lcpg, 0)];

  // create & set camera
  const camera = new Orbit();
  camera.set(new Vector3(0, 2, -10), new Vector3(0, 0, 0));
  camera.movementSpeed = 0.15;

  camera.aperture = 0;
  camera.fov = 0.69;
  camera.focusDistance = 9.53;
  camera.exposure = 1.85;

  let envmap = new Envmap();
  await envmap.fromEquirect(globals.assetsPath + 'envmaps/lebombo_1k.hdr');
  envmap.scale = 0.5;
  envmap.rotX = 5.2;
  envmap.rotY = 0.5;

  return { triangles, materials, camera, envmap };
}
