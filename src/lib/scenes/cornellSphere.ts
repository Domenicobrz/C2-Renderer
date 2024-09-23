import { Color, Mesh, SphereGeometry, TextureLoader, Vector2, Vector3 } from 'three';
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

export async function cornellSphereScene(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse(new Color(0.95, 0.95, 0.95)),
    new Diffuse(new Color(1, 0.05, 0.05)),
    new TorranceSparrow(new Color(0.95, 0.95, 0.95), 0.125, 0.025),
    new Emissive(new Color(1, 0.7, 0.5), 20),
    new Diffuse(new Color(0.05, 1, 0.05)),
    new TorranceSparrow(new Color(0.95, 0.95, 0.95), 0.45, 0.45),
    new TorranceSparrow(new Color(0.95, 0.95, 0.95), 0.175, 0.175),
    new TorranceSparrow(new Color(0.95, 0.95, 0.95), 0.025, 0.025),
    new TorranceSparrow(new Color(0.95, 0.95, 0.95), 0.25, 0.025),
    new TorranceSparrow(new Color(0.95, 0.95, 0.95), 0.725, 0.025),
    new CookTorrance(new Color(0.95, 0.95, 0.95), 0.725),
    new Dielectric(new Color(0.095, 0.195, 0.295), 0.05, 0.05, 1.5)
  ];

  for (let i = 0; i < 5; i++) {
    let ps = 4;
    let mi = 0;

    let raxis = new Vector3(1, 0, 0),
      rangle = 0;

    if (i == 0) {
      mi = 0;
    }

    if (i == 1) {
      raxis = new Vector3(0, 0, 1);
      rangle = Math.PI * 0.5;
      mi = 1;
    }
    if (i == 2) {
      raxis = new Vector3(0, 0, 1);
      rangle = Math.PI * 1.0;
    }

    if (i == 3) {
      raxis = new Vector3(0, 0, 1);
      rangle = Math.PI * 1.5;
      mi = 4; // diffuse green
    }

    if (i == 4) {
      raxis = new Vector3(-1, 0, 0);
      rangle = Math.PI * 0.5;
    }

    triangles.push(
      new Triangle(
        new Vector3(-1, -1, -1).multiplyScalar(ps).applyAxisAngle(raxis, rangle),
        new Vector3(-1, -1, +1).multiplyScalar(ps).applyAxisAngle(raxis, rangle),
        new Vector3(+1, -1, +1).multiplyScalar(ps).applyAxisAngle(raxis, rangle),
        mi
      )
    );
    triangles.push(
      new Triangle(
        new Vector3(+1, -1, +1).multiplyScalar(ps).applyAxisAngle(raxis, rangle),
        new Vector3(-1, -1, -1).multiplyScalar(ps).applyAxisAngle(raxis, rangle),
        new Vector3(+1, -1, -1).multiplyScalar(ps).applyAxisAngle(raxis, rangle),
        mi
      )
    );
  }

  const ls = 0.75;
  // const ls = 0.05;
  // const ls = 4.05;
  const lt = new Vector3(0, 3.9, 0);
  triangles.push(
    new Triangle(
      new Vector3(-1, 0, -1).multiplyScalar(ls).add(lt),
      new Vector3(+1, 0, +1).multiplyScalar(ls).add(lt),
      new Vector3(-1, 0, +1).multiplyScalar(ls).add(lt),
      3
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(-1, 0, -1).multiplyScalar(ls).add(lt),
      new Vector3(+1, 0, -1).multiplyScalar(ls).add(lt),
      new Vector3(+1, 0, +1).multiplyScalar(ls).add(lt),
      3
    )
  );

  let mesh = new Mesh(new SphereGeometry(1, 20, 20));
  mesh.scale.set(2, 2, 2);
  mesh.position.set(0, 0, 0);

  let image = (await new TextureLoader().loadAsync('scene-assets/textures/checker-map.png')).source
    .data;
  let roughnessImage = (
    await new TextureLoader().loadAsync('scene-assets/textures/roughness-map-2.png')
  ).source.data;
  // let mat = new Diffuse(new Color(0.95, 0.95, 0.95), image as HTMLImageElement);
  let mat = new TorranceSparrow(
    new Color(0.975, 0.975, 0.975),
    0.91,
    0.91,
    image as HTMLImageElement,
    roughnessImage as HTMLImageElement
  );
  materials.push(mat);

  triangles = [...triangles, ...meshToTriangles(mesh, materials.length - 1)];

  // create & set camera
  const camera = new Orbit();
  camera.set(new Vector3(0, 4, -10), new Vector3(0, 0, 0));
  camera.movementSpeed = 0.15;

  camera.fov = 0.69;
  camera.aperture = 0.25;
  camera.focusDistance = 9.53;
  camera.exposure = 1.85;

  return { triangles, materials, camera };
}
