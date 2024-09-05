import { Vector2 } from 'three';
import { ComputeSegment } from './segment/computeSegment';
import { RenderSegment } from './segment/renderSegment';
import { vec2 } from './utils/math';
import { onKey } from './utils/keys';
import { renderView, samplesInfo } from '../routes/stores/main';
import { createScene } from './createScene';
import type { C2Scene } from './createScene';
import { TileSequence } from './tile';
import { RenderTextureSegment } from './segment/renderTextureSegment';
import { PreviewSegment } from './segment/previewSegment';
import { get } from 'svelte/store';

let computeSegment: ComputeSegment;
let renderSegment: RenderSegment;
let previewSegment: PreviewSegment;
let scene: C2Scene;
let canvasSize = new Vector2(-1, -1);

export const globals: {
  device: GPUDevice;
} = {
  // not sure how to tell typescript that this value will exist when I'll try to access it
  device: null as any
};

export type RendererInterface = {
  getFocusDistanceFromScreenPoint: (point: Vector2) => number;
};

export async function Renderer(canvas: HTMLCanvasElement): Promise<RendererInterface> {
  // WebGPU typescript types are loaded from an external library:
  // https://github.com/gpuweb/types
  // apparently the standard installation didn't include WebGPU types
  const adapter = await navigator.gpu?.requestAdapter();
  const canTimestamp = adapter?.features.has('timestamp-query');
  const device = await (adapter as any)?.requestDevice({
    requiredFeatures: [...(canTimestamp ? ['timestamp-query'] : []), 'float32-filterable']
  });
  const context = canvas.getContext('webgpu');
  globals.device = device;

  if (!device || !context) {
    throw new Error('need a browser that supports WebGPU');
  }

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat
  });

  // *************** compute & render segments ****************
  const tileSequence = new TileSequence();
  computeSegment = new ComputeSegment(tileSequence);

  // passed down to both compute and render segment
  scene = await createScene();
  scene.camera.setCanvasContainer(canvas.parentElement as HTMLDivElement);

  computeSegment.updateScene(scene);
  computeSegment.setDebugPixelTarget(600, 300);

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
  renderLoop();

  return {
    getFocusDistanceFromScreenPoint:
      computeSegment.getFocusDistanceFromScreenPoint.bind(computeSegment)
  };
}

function onCanvasResize(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
  scene: C2Scene,
  computeSegment: ComputeSegment,
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
async function renderLoop() {
  requestAnimationFrame(renderLoop);

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
}

function previewRenderLoop() {
  previewSegment.render();
}

function realtimeRenderLoop() {}

function computeRenderLoop() {
  if (samplesInfo.count >= samplesInfo.limit) {
    return;
  }

  computeSegment.compute();
  computeSegment.passPerformance
    .getDeltaInMilliseconds()
    .then((delta) => {
      if (delta < 25) {
        computeSegment.increaseTileSize();
      } else if (delta > 100) {
        // unfortunately some pixels in the long run might be computed much less than others
        // by following this approach of increasing / decreasing tile size.
        // I did find however that having a "range" of performance values helped with the issue
        // instead of having e.g. increase if < 30 or decrease if > 30, having a range
        // helped with dealing with the issue of some pixels not being computed as often as others
        computeSegment.decreaseTileSize();
      }
      samplesInfo.setPerformance(delta);
    })
    .catch(() => {});
  renderSegment.render();
}
