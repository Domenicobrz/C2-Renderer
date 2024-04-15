import type { Material } from './materials/material';
import type { Triangle } from './primitives/triangle';
import { cornellSphereScene } from './scenes/cornellSphere';
import { cornellTrianglesScene } from './scenes/cornellTriangles';
import { horseStatueScene } from './scenes/horseStatue';
import { misTestScene } from './scenes/misTest';

export async function createScene(): Promise<{ triangles: Triangle[]; materials: Material[] }> {
  return horseStatueScene();
  // return cornellSphereScene();
  // return cornellTrianglesScene();
  // return misTestScene();
}
