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

export function cornellTrianglesScene(): { triangles: Triangle[]; materials: Material[] } {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse(new Color(0.95, 0.95, 0.95)),
    new Diffuse(new Color(1, 0.05, 0.05)),
    new GGX(new Color(0.05, 1, 0.05), 0.02),
    new Emissive(new Color(1, 0.7, 0.5), 40),
    // new Emissive(new Color(1, 0.7, 0.5), 6000),
    // new Emissive(new Color(1, 0.7, 0.5), 2),
    new Diffuse(new Color(0.05, 1, 0.05))
  ];

  for (let i = 0; i < 500; i++) {
    let s = r() * 0.5 + 0.25;
    let rotAxis = new Vector3(nr(), nr(), nr()).normalize();
    let rotAngle = r() * 10;
    let addV = new Vector3(nr() * 4, nr() * 2 - 2, nr() * 4);
    let t = new Triangle(
      new Vector3(-1, 0, 0).multiplyScalar(s).applyAxisAngle(rotAxis, rotAngle).add(addV),
      new Vector3(0, 1.5, 0).multiplyScalar(s).applyAxisAngle(rotAxis, rotAngle).add(addV),
      new Vector3(+1, 0, 0).multiplyScalar(s).applyAxisAngle(rotAxis, rotAngle).add(addV),
      i % 2 === 0 ? 0 : 1
    );
    triangles.push(t);
  }

  // for (let i = 0; i < 150000; i++) {
  //   let s = r() * 0.15 + 0.025;
  //   let rotAxis = new Vector3(nr(), nr(), nr()).normalize();
  //   let rotAngle = r() * 10;
  //   // let addV = new Vector3(nr() * 4, nr() * 0.32 - 3, nr() * 1 - 3);
  //   let addV = new Vector3(nr() * 4, nr() * 2 - 2, nr() * 4);
  //   let t = new Triangle(
  //     new Vector3(-1, 0, 0).multiplyScalar(s).applyAxisAngle(rotAxis, rotAngle).add(addV),
  //     new Vector3(0, 1.5, 0).multiplyScalar(s).applyAxisAngle(rotAxis, rotAngle).add(addV),
  //     new Vector3(+1, 0, 0).multiplyScalar(s).applyAxisAngle(rotAxis, rotAngle).add(addV),
  //     i % 2 === 0 ? 0 : 1
  //   );
  //   triangles.push(t);
  // }

  // triangles.push(
  //   new Triangle(
  //     new Vector3(-1, 0, -5).multiplyScalar(2),
  //     new Vector3(0, 1.5, -5).multiplyScalar(2),
  //     new Vector3(+1, 0, -5).multiplyScalar(2),
  //     2
  //   )
  // );

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
      // mi = 2; // metal green
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
  // triangles.push(
  //   new Triangle(
  //     new Vector3(-1, 0, -1).multiplyScalar(ls).add(lt),
  //     new Vector3(+1, 0, +1).multiplyScalar(ls).add(lt),
  //     new Vector3(+1, 0, -1).multiplyScalar(ls).add(lt),
  //     3
  //   )
  // );

  triangles.push(
    new Triangle(
      new Vector3(+2, 0, +1).multiplyScalar(1.5).add(new Vector3(-1.5, 0, -1.5)),
      new Vector3(+3, 2, +2).multiplyScalar(1.5).add(new Vector3(-1.5, 0, -1.5)),
      new Vector3(+4, 0, +3).multiplyScalar(1.5).add(new Vector3(-1.5, 0, -1.5)),
      0
    )
  );

  // apparently MIS stops working with GGX materials (that are exclusively sampling the brdf)
  // and it makes sense, because we let variance creep into the integral...

  return { triangles, materials };
}
