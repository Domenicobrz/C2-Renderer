import { Matrix4, Vector3 } from 'three';
import { ComputeSegment } from './segment/computeSegment';
import { RenderSegment } from './segment/renderSegment';
import { vec2 } from './utils/math';
import { Orbit } from './controls/Orbit';
import { onKey } from './utils/keys';

export async function Renderer(canvas: HTMLCanvasElement): Promise<void> {
  // WebGPU typescript types are loaded from an external library:
  // https://github.com/gpuweb/types
  // apparently the standard installation didn't include WebGPU types
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
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
  const computeSegment = new ComputeSegment(device);
  computeSegment.setDebugPixelTarget(200, 200);
  computeSegment.updateScene([
    {
      v0: new Vector3(-1, 0, 0),
      v1: new Vector3(0, 1.5, 0),
      v2: new Vector3(+1, 0, 0),
      normal: new Vector3(0, 0, -1),
      materialOffset: 0
    },
    {
      v0: new Vector3(-1, 0, 0).multiplyScalar(0.6).add(new Vector3(1.5, 1.5, 0)),
      v1: new Vector3(0, 1.5, 0).multiplyScalar(0.6).add(new Vector3(1.5, 1.5, 0)),
      v2: new Vector3(+1, 0, 0).multiplyScalar(0.6).add(new Vector3(1.5, 1.5, 0)),
      normal: new Vector3(0, 0, -1),
      materialOffset: 0
    }
  ]);
  const renderSegment = new RenderSegment(device, context, presentationFormat);

  const resizeObserver = new ResizeObserver((entries) => {
    onCanvasResize(canvas, device, computeSegment, renderSegment);
    render(computeSegment, renderSegment);
  });
  resizeObserver.observe(canvas);
  // initialize work buffers immediately
  onCanvasResize(canvas, device, computeSegment, renderSegment);

  // create & set camera
  const orbit = new Orbit();
  orbit.e.addEventListener('change', () => {
    computeSegment.updateCamera(orbit.position, orbit.fov, orbit.rotationMatrix);
    render(computeSegment, renderSegment);
  });
  // will fire the 'change' event
  orbit.set(new Vector3(0, 0, -10), new Vector3(0, 0, 0));

  onKey('l', () => computeSegment.logDebugResult());
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

  // we need to resize before we're able to render
  computeSegment.resize(canvasSize, workBuffer);
  renderSegment.resize(canvasSize, workBuffer);
}

function render(computeSegment: ComputeSegment, renderSegment: RenderSegment) {
  computeSegment.compute();
  renderSegment.render();
}

export function loadModel(path: string): void {}
