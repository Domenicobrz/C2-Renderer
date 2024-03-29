import { Color, Vector3 } from 'three';
import { Diffuse } from './../materials/diffuse';
import { Emissive } from './../materials/emissive';
import type { Material } from './../materials/material';
import { Triangle } from './../primitives/triangle';
import { GGX } from './../materials/ggx';
import random, { RNG } from 'random';

random.use('test-string' as unknown as RNG);
// random.use(Math.random() as unknown as RNG);
let r = random.float;
let nr = function () {
  return r() * 2 - 1;
};

export function cornellSphereScene(): { triangles: Triangle[]; materials: Material[] } {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse(new Color(0.95, 0.95, 0.95)),
    new Diffuse(new Color(1, 0.05, 0.05)),
    new GGX(new Color(0.95, 0.95, 0.95), 0.02),
    new Emissive(new Color(1, 0.7, 0.5), 20),
    // new Emissive(new Color(1, 0.7, 0.5), 6000),
    // new Emissive(new Color(1, 0.7, 0.5), 2),
    new Diffuse(new Color(0.05, 1, 0.05))
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

  // sphere
  let tcount = 70;
  let pcount = 100;
  for (let i = 0; i < tcount; i++) {
    for (let j = 0; j < pcount; j++) {
      let theta0 = (i / tcount) * Math.PI;
      if (i === 0) theta0 = 0.01;
      let theta1 = ((i + 1) / tcount) * Math.PI;
      let phi0 = (j / pcount) * Math.PI * 2;
      let phi1 = ((j + 1) / pcount) * Math.PI * 2;

      let v0 = new Vector3(
        Math.cos(phi0) * Math.sin(theta0),
        Math.cos(theta0),
        Math.sin(phi0) * Math.sin(theta0)
      );
      let v1 = new Vector3(
        Math.cos(phi0) * Math.sin(theta1),
        Math.cos(theta1),
        Math.sin(phi0) * Math.sin(theta1)
      );
      let v2 = new Vector3(
        Math.cos(phi1) * Math.sin(theta0),
        Math.cos(theta0),
        Math.sin(phi1) * Math.sin(theta0)
      );
      let v3 = new Vector3(
        Math.cos(phi1) * Math.sin(theta1),
        Math.cos(theta1),
        Math.sin(phi1) * Math.sin(theta1)
      );

      const rad = 2;
      const transl = new Vector3(0, 0, 2);
      const materialIndex = 2;

      triangles.push(
        new Triangle(
          v0.clone().multiplyScalar(rad).add(transl),
          v1.clone().multiplyScalar(rad).add(transl),
          v3.clone().multiplyScalar(rad).add(transl),
          materialIndex
        )
      );

      triangles.push(
        new Triangle(
          v3.clone().multiplyScalar(rad).add(transl),
          v0.clone().multiplyScalar(rad).add(transl),
          v2.clone().multiplyScalar(rad).add(transl),
          materialIndex
        )
      );
    }
  }

  return { triangles, materials };
}
