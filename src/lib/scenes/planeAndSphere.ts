import { Color, Mesh, PlaneGeometry, SphereGeometry, Vector2, Vector3 } from 'three';
import { Diffuse } from '../materials/diffuse';
import { Emissive } from './../materials/emissive';
import type { Material } from './../materials/material';
import { Triangle } from './../primitives/triangle';
import { meshToTriangles } from '$lib/utils/three/meshToTriangles';
import type { C2Scene } from '$lib/createScene';
import { Envmap } from '$lib/envmap/envmap';
import { TorranceSparrow } from '$lib/materials/torranceSparrow';
import { loadArrayBuffer } from '$lib/utils/loadArrayBuffer';
import { saveArrayBufferLocally } from '$lib/utils/saveArrayBufferLocally';
import { Orbit } from '$lib/controls/Orbit';
import { Dielectric } from '$lib/materials/dielectric';

export async function planeAndSphere(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse(new Color(0.95, 0.95, 0.95)),
    new Diffuse(new Color(1, 0.05, 0.05)),
    new Emissive(new Color(1, 0.45, 0.25), 3),
    new TorranceSparrow(new Color(0.5, 0.5, 0.5), 0.9, 0.9),
    new Dielectric(new Color(0.35, 0.68, 0.99).multiplyScalar(0), 0.5, 0.5, 2.0)
  ];

  let ps = 4;
  let vm = new Vector3(ps, 1.5, ps);
  triangles.push(
    new Triangle(
      new Vector3(-1, -1, -1).multiply(vm),
      new Vector3(-1, -1, +1).multiply(vm),
      new Vector3(+1, -1, +1).multiply(vm),
      0
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(+1, -1, +1).multiply(vm),
      new Vector3(-1, -1, -1).multiply(vm),
      new Vector3(+1, -1, -1).multiply(vm),
      0
    )
  );

  const ls = 1.15;
  const lt = new Vector3(0, 3.9, 0);
  triangles.push(
    new Triangle(
      new Vector3(-1, 0, -1).multiplyScalar(ls).add(lt),
      new Vector3(+1, 0, +1).multiplyScalar(ls).add(lt),
      new Vector3(-1, 0, +1).multiplyScalar(ls).add(lt),
      2
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(-1, 0, -1).multiplyScalar(ls).add(lt),
      new Vector3(+1, 0, -1).multiplyScalar(ls).add(lt),
      new Vector3(+1, 0, +1).multiplyScalar(ls).add(lt),
      2
    )
  );

  let mesh = new Mesh(new SphereGeometry(1, 30, 30));
  mesh.scale.set(2, 2, 2);
  mesh.position.set(0, 0.35, 0);
  triangles = [...triangles, ...meshToTriangles(mesh, 4)];

  // let pmesh = new Mesh(new PlaneGeometry(3, 3));
  // pmesh.rotation.x = Math.PI * 0.5;
  // pmesh.position.set(0, -1, 0);
  // triangles = [...triangles, ...meshToTriangles(pmesh, 0)];

  // let eBuffer = await loadArrayBuffer('scene-assets/test/envmap.env');
  // let envmap = new Envmap().fromArrayBuffer(eBuffer!);

  let envmap = new Envmap();
  await envmap.fromEquirect('scene-assets/envmaps/envmap.hdr', 400);
  // saveArrayBufferLocally(envmap.getArrayBuffer(), 'envmap.env');
  envmap.scale = 0.9;

  // create & set camera
  const camera = new Orbit();
  camera.set(new Vector3(0, 4, -10), new Vector3(0, 0, 0));
  camera.movementSpeed = 0.15;

  camera.fov = 0.61;
  camera.aperture = 0.025;
  camera.focusDistance = 10.623570517658289;
  camera.exposure = 1.85;

  return { triangles, materials, camera };
}
