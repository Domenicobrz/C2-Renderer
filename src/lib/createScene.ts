import { Camera } from './controls/Camera';
import { Envmap } from './envmap/envmap';
import type { Material } from './materials/material';
import type { Triangle } from './primitives/triangle';
import { bokehTestScene } from './scenes/bokehTest';
import { dofTestScene } from './scenes/dofTest';

export type C2Scene = {
  triangles: Triangle[];
  materials: Material[];
  envmap?: Envmap;
  camera: Camera;
};

export async function createScene(): Promise<C2Scene> {
  // return horseStatueScene();
  // return cornellSphereScene();
  // return planeAndSphere();
  // return envmapHorseScene();
  return dofTestScene();
  // return bokehTestScene();
  // return cornellTrianglesScene();
  // return misTestScene();
}
