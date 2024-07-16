import { Color, Mesh, SphereGeometry, Vector2, Vector3 } from 'three';
import { Diffuse } from '../materials/diffuse';
import { Emissive } from './../materials/emissive';
import type { Material } from './../materials/material';
import { Triangle } from './../primitives/triangle';
import { meshToTriangles } from '$lib/utils/three/meshToTriangles';
import type { C2Scene } from '$lib/createScene';
import { Envmap } from '$lib/envmap/envmap';

export async function planeAndSphere(): Promise<C2Scene> {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse(new Color(0.95, 0.95, 0.95)),
    new Diffuse(new Color(1, 0.05, 0.05)),
    new Emissive(new Color(1, 0.7, 0.5), 20)
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

  const ls = 0.75;
  // const ls = 0.05;
  // const ls = 4.05;
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

  let mesh = new Mesh(new SphereGeometry(1, 20, 20));
  mesh.scale.set(2, 2, 2);
  mesh.position.set(0, 0, 0);

  triangles = [...triangles, ...meshToTriangles(mesh, 1)];

  let envmap = new Envmap();
  await envmap.fromEquirect('scene-assets/envmaps/envmap.hdr');

  // remember that adding an envmap also changes the light CDF sampling probabilities
  // and since envmaps are assigned to -2 until you fully implement envmap sampling
  // enabling the envmap will return darker images since you're not sampling the envmap yet
  // - - - - - - -
  // also remember the scale value based on scene radius when you have to return the color
  // from the envmap

  return { triangles, materials, envmap };
}
