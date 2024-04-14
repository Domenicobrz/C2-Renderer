import { Color, Matrix4, Vector3 } from 'three';
import { ComputeSegment } from './segment/computeSegment';
import { RenderSegment } from './segment/renderSegment';
import { vec2 } from './utils/math';
import { Orbit } from './controls/Orbit';
import { onKey } from './utils/keys';
import { samplesInfo } from '../routes/stores/main';
import { createScene } from './createScene';
import { Config } from './config';
import { TileSequence } from './tile';

let computeSegment: ComputeSegment;
let renderSegment: RenderSegment;

export async function Renderer(canvas: HTMLCanvasElement): Promise<void> {
  // WebGPU typescript types are loaded from an external library:
  // https://github.com/gpuweb/types
  // apparently the standard installation didn't include WebGPU types
  const adapter = await navigator.gpu?.requestAdapter();
  const canTimestamp = adapter?.features.has('timestamp-query');
  const device = await (adapter as any)?.requestDevice({
    requiredFeatures: [...(canTimestamp ? ['timestamp-query'] : [])]
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
  // computeSegment.setDebugPixelTarget(280, 385);
  computeSegment.setDebugPixelTarget(400, 320);
  let { triangles, materials } = createScene();
  computeSegment.updateScene(triangles, materials);
  renderSegment = new RenderSegment(device, context, presentationFormat, tileSequence);

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

  const config = new Config();
  config.e.addEventListener('config-update', () => {
    computeSegment.updateConfig(config);
  });
  computeSegment.updateConfig(config);

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

export function loadModel(path: string): void {}
