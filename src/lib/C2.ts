import { Vector2 } from 'three';
import { ComputeSegment } from './segment/integrators/computeSegment';
import { RenderSegment } from './segment/renderSegment';
import { vec2 } from './utils/math';
import { onKey } from './utils/keys';
import {
  centralStatusMessage,
  configOptions,
  renderView,
  samplesInfo,
  selectedSceneStore
} from '../routes/stores/main';
import { createScene } from './createScene';
import type { C2Scene, SceneName } from './createScene';
import { PreviewSegment } from './segment/previewSegment';
import { get } from 'svelte/store';
import { tick } from './utils/tick';
import { getDeviceAndContext } from './webgpu-utils/getDeviceAndContext';
import { ReSTIRPTSegment } from './segment/integrators/ReSTIRPTSegment';
import { type IntegratorType } from './config';
import type { LUTManager } from './managers/lutManager';
import { loadCommonAssets } from './loadCommonAssets';
import { once } from './utils/once';
import { SceneDataManager } from './sceneManager';
import { EventHandler } from './eventHandler';

export type Integrator = ComputeSegment | ReSTIRPTSegment;

let computeSegment: Integrator;
let renderSegment: RenderSegment;
let previewSegment: PreviewSegment;
let scene: C2Scene;
let sceneDataManager: SceneDataManager;
let canvasSize = new Vector2(-1, -1);

export const globals: {
  device: GPUDevice;
  adapter: GPUAdapter;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
  common: {
    lutManager: LUTManager;
    blueNoiseTexture: GPUTexture;
  };
  buffers: {
    radianceBuffer: GPUBuffer;
    samplesCountBuffer: GPUBuffer;
  };
  animationFrameHandle: number | null;
  assetsPath: string;
  e: EventHandler;
} = {
  // not sure how to tell typescript that these values will exist when I'll try to access them
  device: null as any,
  adapter: null as any,
  context: null as any,
  format: null as any,
  canvas: null as any,
  common: {
    lutManager: null as any,
    blueNoiseTexture: null as any
  },
  buffers: {
    radianceBuffer: null as any,
    samplesCountBuffer: null as any
  },
  animationFrameHandle: null,
  assetsPath: 'https://domenicobrz.github.io/scene-assets/',
  e: new EventHandler()
};

export type RendererInterface = {
  getFocusDistanceFromScreenPoint: (point: Vector2) => number;
  restart: () => void;
};

export async function Renderer(canvas: HTMLCanvasElement): Promise<RendererInterface> {
  // WebGPU typescript types are loaded from an external library:
  // https://github.com/gpuweb/types
  // apparently the standard installation didn't include WebGPU types
  const { device, context, adapter } = await getDeviceAndContext(canvas);

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat
  });

  globals.device = device;
  globals.adapter = adapter;
  globals.context = context;
  globals.format = presentationFormat;
  globals.canvas = canvas;

  // will create and load lutManager's textures and bluenoisetexture
  await loadCommonAssets();

  renderSegment = new RenderSegment(context, presentationFormat);
  previewSegment = new PreviewSegment(context, presentationFormat);

  sceneDataManager = new SceneDataManager(globals.device);
  await switchScene(get(selectedSceneStore));

  const resizeObserver = new ResizeObserver(async (entries) => {
    if (once('first-canvas-resize')) {
      // will select the correct integrator based on the initial config value
      await switchIntegrator(get(configOptions).integrator);
    } else {
      onCanvasResize(canvas, device, scene, computeSegment, renderSegment, previewSegment);
    }
  });
  resizeObserver.observe(canvas);

  onKey('l', () => computeSegment.logDebugResult());

  // let msls = new MultiScatterLUTSegment();
  // msls.setSize(new Vector3(32, 32, 32), 1);
  // msls.calculateEavg(arrayData, 32);

  listenForSceneSwitch();
  listenForIntegratorSwitch();

  return {
    getFocusDistanceFromScreenPoint: (point: Vector2) => {
      return sceneDataManager.getFocusDistanceFromScreenPoint(point, canvasSize);
    },
    restart: () => {
      if (computeSegment instanceof ReSTIRPTSegment) {
        return computeSegment.requestReset();
      }
      return computeSegment.resetSamplesAndTile();
    }
  };
}

function onCanvasResize(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
  scene: C2Scene,
  computeSegment: Integrator,
  renderSegment: RenderSegment,
  previewSegment: PreviewSegment
) {
  canvasSize = vec2(canvas.width, canvas.height);

  scene.camera.onCanvasResize(canvasSize);

  if (globals.buffers.radianceBuffer) {
    globals.buffers.radianceBuffer.destroy();
  }
  if (globals.buffers.samplesCountBuffer) {
    globals.buffers.samplesCountBuffer.destroy();
  }

  const input = new Float32Array(canvasSize.x * canvasSize.y * 4);
  globals.buffers.radianceBuffer = device.createBuffer({
    label: 'radiance',
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(globals.buffers.radianceBuffer, 0, input);

  globals.buffers.samplesCountBuffer = device.createBuffer({
    label: 'samples count',
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(
    globals.buffers.samplesCountBuffer,
    0,
    new Uint32Array(canvasSize.x * canvasSize.y)
  );

  // we need to resize before we're able to render
  computeSegment.resize(
    canvasSize,
    globals.buffers.radianceBuffer,
    globals.buffers.samplesCountBuffer
  );
  renderSegment.resize(
    canvasSize,
    globals.buffers.radianceBuffer,
    globals.buffers.samplesCountBuffer
  );
  previewSegment.resize(canvasSize);
}

let prevRW = '';
async function renderLoop() {
  scene.camera.renderLoopUpdate();

  let rw = get(renderView);

  if (prevRW == 'compute' && rw != 'compute') {
    computeSegment.resetSamplesAndTile();
  }

  if (rw == 'compute') {
    await computeRenderLoop();
  } else if (rw == 'preview') {
    previewRenderLoop();
  } else if (rw == 'realtime') {
    realtimeRenderLoop();
  }

  prevRW = rw;
  globals.animationFrameHandle = requestAnimationFrame(renderLoop);

  globals.e.fireEvent('on-after-render');
}

function previewRenderLoop() {
  previewSegment.setMode('normal');
  previewSegment.render();
}

function realtimeRenderLoop() {
  previewSegment.setMode('camera-light');
  previewSegment.render();
}

async function computeRenderLoop() {
  if (samplesInfo.count >= samplesInfo.limit) {
    return;
  }

  await computeSegment.compute();
  renderSegment.render();
}

function waitUntilRenderLoopFinishes() {
  return new Promise((res, _) => {
    function onAfterRender() {
      globals.e.removeEventListener('on-after-render', onAfterRender);
      res(null);
    }
    globals.e.addEventListener('on-after-render', onAfterRender);
  });
}

function listenForIntegratorSwitch() {
  configOptions.subscribe((value) => {
    let prevIntegrator = configOptions.getOldValue().integrator;
    let currIntegrator = value.integrator;
    if (currIntegrator != prevIntegrator) {
      switchIntegrator(currIntegrator);
    }
  });
}

function listenForSceneSwitch() {
  let previousScene = get(selectedSceneStore);
  selectedSceneStore.subscribe((newScene) => {
    if (newScene != previousScene) {
      switchScene(newScene);
      previousScene = newScene;
    }
  });
}

async function switchScene(name: SceneName) {
  centralStatusMessage.set('creating scene');
  await tick(); // will give us the chance of showing the message above

  if (scene) {
    scene.dispose();
    await waitUntilRenderLoopFinishes();
  }
  scene = await createScene(name);
  scene.camera.setCanvasContainer(globals.canvas.parentElement as HTMLDivElement);

  centralStatusMessage.set('processing bvh and materials');
  await tick(); // will give us the chance of showing the message above

  sceneDataManager.update(scene);

  renderSegment.updateScene(scene);
  previewSegment.updateScene(scene);

  centralStatusMessage.set('');
}

async function switchIntegrator(integratorType: IntegratorType) {
  if (computeSegment) {
    // wait until the integrator finishes the current iteration (useful since some are using multiple
    // await blocks that can cause stale data to remain after they exit from those await blocks)
    await waitUntilRenderLoopFinishes();

    computeSegment.dispose();
  }

  // to make sure we're cancelling the last issued animation frame handle, we'll wait
  // until the render loop fully completes its function's body with the function above
  if (globals.animationFrameHandle) {
    cancelAnimationFrame(globals.animationFrameHandle);
  }

  if (integratorType == 'ReSTIR') {
    computeSegment = new ReSTIRPTSegment();
  }
  if (integratorType == 'Simple-path-trace') {
    computeSegment = new ComputeSegment();
  }

  computeSegment.setSceneDataManager(sceneDataManager);
  // manually fire scene updated event such that compute segment catches it
  sceneDataManager.e.fireEvent('on-scene-update');

  onCanvasResize(
    globals.canvas,
    globals.device,
    scene,
    computeSegment,
    renderSegment,
    previewSegment
  );

  computeSegment.setDebugPixelTarget(368, 313);

  renderLoop();
}
