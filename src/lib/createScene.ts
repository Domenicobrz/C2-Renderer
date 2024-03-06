import type { Material } from './materials/material';
import type { Triangle } from './primitives/triangle';
import { cornellTrianglesScene } from './scenes/cornellTriangles';
import { misTestScene } from './scenes/misTest';

export function createScene(): { triangles: Triangle[]; materials: Material[] } {
  // return cornellTrianglesScene();
  return misTestScene();
}
