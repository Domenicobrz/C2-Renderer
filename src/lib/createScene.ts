import { Camera } from './controls/Camera';
import { Envmap } from './envmap/envmap';
import type { Material } from './materials/material';
import type { Triangle } from './primitives/triangle';
import { c2FeaturesScene } from './scenes/c2features';
import { c2Features2Scene } from './scenes/c2features2';
import { c2FeaturesScene_Debug } from './scenes/c2features_debug';
import { cornellSphereScene } from './scenes/cornellSphere';
import { dofQuadTest } from './scenes/dofQuadTest';
import { envmapHorseScene } from './scenes/envmapHorse';
import { envmapSphereScene } from './scenes/envmapSphere';
import { furnaceTestScene } from './scenes/furnaceTest';
import { ReSTIREnvmapScene } from './scenes/ReSTIRenvmap';
import { ReSTIRTestScene } from './scenes/ReSTIRtest';
import { ReSTIRTest2Scene } from './scenes/ReSTIRtest2';
import { ReSTIRTest3Scene } from './scenes/ReSTIRtest3';

export type C2Scene = {
  triangles: Triangle[];
  materials: Material[];
  envmap?: Envmap;
  camera: Camera;
  dispose: () => void;
};

export const availableScenes = [
  { name: 'C2 features', thumbnail: 'scene-assets-TO-REMOVE/thumbnails/c2-renderer.jpg' },
  { name: 'Cornell sphere', thumbnail: 'scene-assets-TO-REMOVE/thumbnails/cornell-sphere.png' }
] as const;

export type SceneName = (typeof availableScenes)[number]['name'];

const sceneConstructors: Record<SceneName, () => Promise<C2Scene>> = {
  'C2 features': c2FeaturesScene,
  'Cornell sphere': cornellSphereScene
};

export async function createScene(constructorName: SceneName): Promise<C2Scene> {
  return sceneConstructors[constructorName]();

  // return furnaceTestScene();
  // return c2Features2Scene();
  // return envmapSphereScene();
  // return ReSTIRTestScene();
  // return ReSTIREnvmapScene();
  // return ReSTIRTest2Scene();
  // return ReSTIRTest3Scene();
  // return c2FeaturesScene_Debug();
  // return envmapHorseScene();
  // return dofQuadTest();
}
