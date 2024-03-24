import type { Material } from './materials/material';
import type { Triangle } from './primitives/triangle';
import { cornellSphereScene } from './scenes/cornellSphere';
import { cornellTrianglesScene } from './scenes/cornellTriangles';
import { misTestScene } from './scenes/misTest';

export function createScene(): { triangles: Triangle[]; materials: Material[] } {
  return cornellSphereScene();
  // return cornellTrianglesScene();
  // return misTestScene();
}
