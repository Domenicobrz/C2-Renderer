import { Vector2 } from 'three';
import { ComputeSegment } from './segment/computeSegment';
import { RenderSegment } from './segment/renderSegment';
import { vec2 } from './utils/math';
import { onKey } from './utils/keys';
import { centralStatusMessage, renderView, samplesInfo } from '../routes/stores/main';
import { createScene } from './createScene';
import type { C2Scene } from './createScene';
import { TileSequence } from './tile';
import { PreviewSegment } from './segment/previewSegment';
import { get } from 'svelte/store';
import { tick } from './utils/tick';
import { getDeviceAndContext } from './webgpu-utils/getDeviceAndContext';
import { ReSTIRPTSegment } from './segment/integrators/ReSTIRPTSegment';

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
} = {
  // not sure how to tell typescript that this value will exist when I'll try to access it
  device: null as any,
  context: null as any,
  format: null as any
};

export type RendererInterface = {
  getFocusDistanceFromScreenPoint: (point: Vector2) => number;
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

  // *************** compute & render segments ****************
  const tileSequence = new TileSequence();
  // computeSegment = new ComputeSegment(tileSequence);
  computeSegment = new ReSTIRPTSegment();

  centralStatusMessage.set('creating scene');
  // passed down to both compute and render segment
  scene = await createScene();
  scene.camera.setCanvasContainer(canvas.parentElement as HTMLDivElement);

  centralStatusMessage.set('processing bvh and materials');
  await tick(); // will give us the chance of showing the message above
  await computeSegment.updateScene(scene);
  computeSegment.setDebugPixelTarget(466, 367);
  renderSegment = new RenderSegment(context, presentationFormat);
  renderSegment.updateScene(scene);

  previewSegment = new PreviewSegment(context, presentationFormat);
  previewSegment.updateScene(scene);

  const resizeObserver = new ResizeObserver((entries) => {
    onCanvasResize(canvas, device, scene, computeSegment, renderSegment, previewSegment);
  });
  resizeObserver.observe(canvas);
  // initialize work buffers immediately
  onCanvasResize(canvas, device, scene, computeSegment, renderSegment, previewSegment);

  onKey('l', () => computeSegment.logDebugResult());

  centralStatusMessage.set('compiling shaders');
  await tick(); // will give us the chance of showing the message above
  renderLoop();
  centralStatusMessage.set('');

  // let msls = new MultiScatterLUTSegment();
  // msls.setSize(new Vector3(32, 32, 32), 1);
  // msls.calculateEavg(arrayData, 32);

  return {
    getFocusDistanceFromScreenPoint:
      computeSegment.getFocusDistanceFromScreenPoint.bind(computeSegment)
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
  // since this function will be called twice at startup, this check will
  // prevent it from running twice
  if (canvasSize.x == canvas.width && canvasSize.y == canvas.height) {
    return;
  }
  canvasSize = vec2(canvas.width, canvas.height);

  scene.camera.onCanvasResize(canvasSize);

  const input = new Float32Array(canvasSize.x * canvasSize.y * 4);
  const workBuffer = device.createBuffer({
    label: 'work buffer',
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(workBuffer, 0, input);

  const samplesCountBuffer = device.createBuffer({
    label: 'work buffer',
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(samplesCountBuffer, 0, new Uint32Array(canvasSize.x * canvasSize.y));

  // we need to resize before we're able to render
  computeSegment.resize(canvasSize, workBuffer, samplesCountBuffer);
  renderSegment.resize(canvasSize, workBuffer, samplesCountBuffer);
  previewSegment.resize(canvasSize);
}

let prevRW = '';
function renderLoop() {
  scene.camera.renderLoopUpdate();

  let rw = get(renderView);

  if (prevRW == 'compute' && rw != 'compute') {
    computeSegment.resetSamplesAndTile();
  }

  if (rw == 'compute') {
    computeRenderLoop();
  } else if (rw == 'preview') {
    previewRenderLoop();
  } else if (rw == 'realtime') {
    realtimeRenderLoop();
  }

  prevRW = rw;
  requestAnimationFrame(renderLoop);
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

  computeSegment.compute();
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
  renderSegment.render();
}
