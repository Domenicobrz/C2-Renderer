import { Color, Vector3 } from 'three';
import { Diffuse } from './materials/diffuse';
import { Emissive } from './materials/emissive';
import type { Material } from './materials/material';
import { Triangle } from './primitives/triangle';

export function createScene(): { triangles: Triangle[]; materials: Material[] } {
  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse(new Color(0.95, 0.95, 0.95)),
    new Diffuse(new Color(1, 0.3, 0.3)),
    new Emissive(new Color(1, 1, 1), 10)
  ];
  for (let i = 0; i < 500; i++) {
    let r = Math.random;
    let nr = function () {
      return Math.random() * 2 - 1;
    };
    let s = r() * 0.5 + 0.25;
    let rotAxis = new Vector3(nr(), nr(), nr()).normalize();
    let rotAngle = r() * 10;
    let addV = new Vector3(nr() * 4, nr() * 4, nr() * 4);
    let t = new Triangle(
      new Vector3(-1, 0, 0).multiplyScalar(s).applyAxisAngle(rotAxis, rotAngle).add(addV),
      new Vector3(0, 1.5, 0).multiplyScalar(s).applyAxisAngle(rotAxis, rotAngle).add(addV),
      new Vector3(+1, 0, 0).multiplyScalar(s).applyAxisAngle(rotAxis, rotAngle).add(addV),
      i % 2 === 0 ? 0 : 1
    );
    triangles.push(t);
  }

  triangles.push(
    new Triangle(
      new Vector3(-1, 0, 0).multiplyScalar(2),
      new Vector3(0, 1.5, 0).multiplyScalar(2),
      new Vector3(+1, 0, 0).multiplyScalar(2),
      2
    )
  );

  return { triangles, materials };
}
