import { Vector3 } from 'three';
import { ComputeSegment } from './segment/computeSegment';
import { RenderSegment } from './segment/renderSegment';
import { vec2 } from './utils/math';
import { Orbit } from './controls/Orbit';
import { onKey } from './utils/keys';
import { samplesInfo } from '../routes/stores/main';
import { createScene } from './createScene';
import { TileSequence } from './tile';
import { RenderTextureSegment } from './segment/renderTextureSegment';
import { Envmap } from './envmap/envmap';

let computeSegment: ComputeSegment;
let renderSegment: RenderSegment;
let renderTextureSegment: RenderTextureSegment;

export async function Renderer(canvas: HTMLCanvasElement): Promise<void> {
  // WebGPU typescript types are loaded from an external library:
  // https://github.com/gpuweb/types
  // apparently the standard installation didn't include WebGPU types
  const adapter = await navigator.gpu?.requestAdapter();
  const canTimestamp = adapter?.features.has('timestamp-query');
  const device = await (adapter as any)?.requestDevice({
    requiredFeatures: [...(canTimestamp ? ['timestamp-query'] : []), 'float32-filterable']
  });
  const context = canvas.getContext('webgpu');

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
  computeSegment = new ComputeSegment(device, tileSequence);
  let scene = await createScene();
  computeSegment.updateScene(scene);
  // computeSegment.setDebugPixelTarget(280, 385);
  computeSegment.setDebugPixelTarget(480, 390);

  renderSegment = new RenderSegment(device, context, presentationFormat);
  renderTextureSegment = new RenderTextureSegment(device, context, presentationFormat);

  const resizeObserver = new ResizeObserver((entries) => {
    onCanvasResize(canvas, device, computeSegment, renderSegment);
  });
  resizeObserver.observe(canvas);
  // initialize work buffers immediately
  onCanvasResize(canvas, device, computeSegment, renderSegment);

  // create & set camera
  const orbit = new Orbit();
  orbit.e.addEventListener('change', () => {
    computeSegment.updateCamera(orbit.position, orbit.fov, orbit.rotationMatrix);
  });
  // will fire the 'change' event
  orbit.set(new Vector3(0, 1, -10), new Vector3(0, 0, 0));

  onKey('l', () => computeSegment.logDebugResult());
  renderLoop();
}

function onCanvasResize(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
  computeSegment: ComputeSegment,
  renderSegment: RenderSegment
) {
  let canvasSize = vec2(canvas.width, canvas.height);

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
}

async function renderLoop() {
  if (samplesInfo.count >= samplesInfo.limit) {
    requestAnimationFrame(renderLoop);
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

  requestAnimationFrame(renderLoop);
}

// REMOVE THE ONCLICK CALL INSIDE APP.SVELTE WHEN YOU DELETE THIS FUNCTION
// REMOVE THE ONCLICK CALL INSIDE APP.SVELTE WHEN YOU DELETE THIS FUNCTION
// REMOVE THE ONCLICK CALL INSIDE APP.SVELTE WHEN YOU DELETE THIS FUNCTION
// REMOVE THE ONCLICK CALL INSIDE APP.SVELTE WHEN YOU DELETE THIS FUNCTION
// REMOVE THE ONCLICK CALL INSIDE APP.SVELTE WHEN YOU DELETE THIS FUNCTION
// REMOVE THE ONCLICK CALL INSIDE APP.SVELTE WHEN YOU DELETE THIS FUNCTION
// REMOVE THE ONCLICK CALL INSIDE APP.SVELTE WHEN YOU DELETE THIS FUNCTION
// REMOVE THE ONCLICK CALL INSIDE APP.SVELTE WHEN YOU DELETE THIS FUNCTION
// REMOVE THE ONCLICK CALL INSIDE APP.SVELTE WHEN YOU DELETE THIS FUNCTION
// REMOVE THE ONCLICK CALL INSIDE APP.SVELTE WHEN YOU DELETE THIS FUNCTION
export async function onClick() {
  let envmap = new Envmap();
  await envmap.fromEquirect('scene-assets/envmaps/envmap.hdr');
  let envmapData = envmap.getData();

  renderTextureSegment.setTextureData(envmapData.data, envmapData.size);
  renderTextureSegment.render();
}
