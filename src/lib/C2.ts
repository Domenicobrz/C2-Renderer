import { Vector2 } from 'three';
import { ComputeSegment } from './segment/computeSegment';
import { RenderSegment } from './segment/renderSegment';
import { vec2 } from './utils/math';
import { onKey } from './utils/keys';
import {
  centralStatusMessage,
  configOptions,
  renderView,
  samplesInfo
} from '../routes/stores/main';
import { createScene } from './createScene';
import type { C2Scene } from './createScene';
import { PreviewSegment } from './segment/previewSegment';
import { get } from 'svelte/store';
import { tick } from './utils/tick';
import { getDeviceAndContext } from './webgpu-utils/getDeviceAndContext';
import { ReSTIRPTSegment } from './segment/integrators/ReSTIRPTSegment';
import { ConfigManager, type IntegratorType } from './config';
import type { LUTManager } from './managers/lutManager';
import { loadCommonAssets } from './loadCommonAssets';
import { once } from './utils/once';

export type Integrator = ComputeSegment | ReSTIRPTSegment;

let computeSegment: Integrator;
let renderSegment: RenderSegment;
let previewSegment: PreviewSegment;
let scene: C2Scene;
let canvasSize = new Vector2(-1, -1);

export const globals: {
  device: GPUDevice;
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
} = {
  // not sure how to tell typescript that these values will exist when I'll try to access them
  device: null as any,
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
  animationFrameHandle: null
};

export type RendererInterface = {
  getFocusDistanceFromScreenPoint: (point: Vector2) => number;
  restart: () => void;
};

export async function Renderer(canvas: HTMLCanvasElement): Promise<RendererInterface> {
  // WebGPU typescript types are loaded from an external library:
  // https://github.com/gpuweb/types
  // apparently the standard installation didn't include WebGPU types
  const { device, context } = await getDeviceAndContext(canvas);

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat
  });

  globals.device = device;
  globals.context = context;
  globals.format = presentationFormat;
  globals.canvas = canvas;

  // will create and load lutManager's textures and bluenoisetexture
  await loadCommonAssets();

  centralStatusMessage.set('creating scene');
  // passed down to both compute and render segment
  scene = await createScene();
  scene.camera.setCanvasContainer(canvas.parentElement as HTMLDivElement);

  renderSegment = new RenderSegment(context, presentationFormat);
  renderSegment.updateScene(scene);

  previewSegment = new PreviewSegment(context, presentationFormat);
  previewSegment.updateScene(scene);

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

  listenForIntegratorSwitch();

  return {
    getFocusDistanceFromScreenPoint: (point: Vector2) => {
      return computeSegment.getFocusDistanceFromScreenPoint(point);
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
    label: 'work buffer',
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(globals.buffers.radianceBuffer, 0, input);

  globals.buffers.samplesCountBuffer = device.createBuffer({
    label: 'work buffer',
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
  if (computeSegment instanceof ComputeSegment) {
    computeSegment.passPerformance
      .getDeltaInMilliseconds()
      .then((delta) => {
        if (delta < 25) {
          if ('increaseTileSize' in computeSegment) {
            computeSegment.increaseTileSize();
          }
        } else if (delta > 100) {
          // unfortunately some pixels in the long run might be computed much less than others
          // by following this approach of increasing / decreasing tile size.
          // I did find however that having a "range" of performance values helped with the issue
          // instead of having e.g. increase if < 30 or decrease if > 30, having a range
          // helped with dealing with the issue of some pixels not being computed as often as others
          if ('decreaseTileSize' in computeSegment) {
            computeSegment.decreaseTileSize();
          }
        }
        samplesInfo.setPerformance(delta);
      })
      .catch(() => {});
  }
  renderSegment.render();
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

async function switchIntegrator(integratorType: IntegratorType) {
  if (globals.animationFrameHandle) {
    cancelAnimationFrame(globals.animationFrameHandle);
  }

  if (integratorType == 'ReSTIR') {
    computeSegment = new ReSTIRPTSegment();
  }
  if (integratorType == 'Simple-path-trace') {
    computeSegment = new ComputeSegment();
  }

  onCanvasResize(
    globals.canvas,
    globals.device,
    scene,
    computeSegment,
    renderSegment,
    previewSegment
  );

  centralStatusMessage.set('processing bvh and materials');
  await tick(); // will give us the chance of showing the message above
  await computeSegment.updateScene(scene); // I don't like this...
  centralStatusMessage.set('');

  // computeSegment.setDebugPixelTarget(637, 59);
  computeSegment.setDebugPixelTarget(713, 41);
  // computeSegment.setDebugPixelTarget(715, 42);

  renderLoop();
}
