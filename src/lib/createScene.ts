import { Envmap } from './envmap/envmap';
import type { Material } from './materials/material';
import type { Triangle } from './primitives/triangle';
import { cornellSphereScene } from './scenes/cornellSphere';
import { cornellTrianglesScene } from './scenes/cornellTriangles';
import { horseStatueScene } from './scenes/horseStatue';
import { misTestScene } from './scenes/misTest';
import { planeAndSphere } from './scenes/planeAndSphere';

export type C2Scene = {
  triangles: Triangle[];
  materials: Material[];
  envmap?: Envmap;
};

export async function createScene(): Promise<C2Scene> {
  // return horseStatueScene();
  // return cornellSphereScene();
  return planeAndSphere();
  // return cornellTrianglesScene();
  // return misTestScene();
}
