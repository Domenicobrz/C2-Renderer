import { Color, Vector3 } from 'three';
import { Diffuse } from './materials/diffuse';
import { Emissive } from './materials/emissive';
import type { Material } from './materials/material';
import { Triangle } from './primitives/triangle';

export function createScene(): { triangles: Triangle[]; materials: Material[] } {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse(new Color(0.95, 0.95, 0.95)),
    new Diffuse(new Color(1, 0.05, 0.05)),
    new Diffuse(new Color(0.05, 1, 0.05)),
    new Emissive(new Color(1, 1, 1), 20)
  ];
  // for (let i = 0; i < 500; i++) {
  //   let r = Math.random;
  //   let nr = function () {
  //     return Math.random() * 2 - 1;
  //   };
  //   let s = r() * 0.5 + 0.25;
  //   let rotAxis = new Vector3(nr(), nr(), nr()).normalize();
  //   let rotAngle = r() * 10;
  //   let addV = new Vector3(nr() * 4, nr() * 4, nr() * 4);
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
      mi = 2;
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

  const ls = 2;
  const lt = new Vector3(0, 5.9, 0);
  triangles.push(
    new Triangle(
      new Vector3(-1, -1, -1).multiplyScalar(ls).add(lt),
      new Vector3(-1, -1, +1).multiplyScalar(ls).add(lt),
      new Vector3(+1, -1, +1).multiplyScalar(ls).add(lt),
      3
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(+1, -1, +1).multiplyScalar(ls).add(lt),
      new Vector3(-1, -1, -1).multiplyScalar(ls).add(lt),
      new Vector3(+1, -1, -1).multiplyScalar(ls).add(lt),
      3
    )
  );

  triangles.push(
    new Triangle(
      new Vector3(+2, 0, +1).multiplyScalar(1.5).add(new Vector3(-1.5, 0, -1.5)),
      new Vector3(+3, 2, +2).multiplyScalar(1.5).add(new Vector3(-1.5, 0, -1.5)),
      new Vector3(+4, 0, +3).multiplyScalar(1.5).add(new Vector3(-1.5, 0, -1.5)),
      0
    )
  );

  return { triangles, materials };
}
