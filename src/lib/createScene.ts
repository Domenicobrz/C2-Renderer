import { Camera } from './controls/Camera';
import { Envmap } from './envmap/envmap';
import type { Material } from './materials/material';
import type { Triangle } from './primitives/triangle';
import { c2FeaturesScene } from './scenes/c2features';
import { c2Features2Scene } from './scenes/c2features2';
import { cornellSphereScene } from './scenes/cornellSphere';
import { envmapHorseScene } from './scenes/envmapHorse';
import { furnaceTestScene } from './scenes/furnaceTest';

export type C2Scene = {
  triangles: Triangle[];
  materials: Material[];
  envmap?: Envmap;
  camera: Camera;
};

export async function createScene(): Promise<C2Scene> {
  // return furnaceTestScene();
  return c2Features2Scene();
  // return cornellSphereScene();
  // return c2FeaturesScene();
  // return envmapHorseScene();
}
