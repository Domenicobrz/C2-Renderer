import { Color, Matrix4, Vector3 } from 'three';
import { ComputeSegment } from './segment/computeSegment';
import { RenderSegment } from './segment/renderSegment';
import { vec2 } from './utils/math';
import { Orbit } from './controls/Orbit';
import { onKey } from './utils/keys';
import { Diffuse } from './materials/diffuse';
import { Triangle } from './primitives/triangle';
import { samplesInfo } from '../routes/stores/main';

let computeSegment: ComputeSegment;
let renderSegment: RenderSegment;

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
  computeSegment = new ComputeSegment(device);
  computeSegment.setDebugPixelTarget(200, 200);
  let triangles: Triangle[] = [];
  for (let i = 0; i < 500; i++) {
    let r = Math.random;
    let nr = function () {
      return Math.random() * 2 - 1;
    };
    let s = r() * 0.1 + 0.035;
    let addV = new Vector3(nr() * 3, nr() * 3, nr() * 3);
    let t = new Triangle(
      new Vector3(-1, 0, 0).multiplyScalar(s).add(addV),
      new Vector3(0, 1.5, 0).multiplyScalar(s).add(addV),
      new Vector3(+1, 0, 0).multiplyScalar(s).add(addV),
      new Vector3(0, 0, -1),
      i % 2 === 0 ? 0 : 4
    );
    triangles.push(t);
  }
  computeSegment.updateScene(triangles, [
    new Diffuse(new Color(1, 0, 0)),
    new Diffuse(new Color(0, 0, 1))
  ]);
  renderSegment = new RenderSegment(device, context, presentationFormat);

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
  orbit.set(new Vector3(0, 0, -10), new Vector3(0, 0, 0));

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

  // we need to resize before we're able to render
  computeSegment.resize(canvasSize, workBuffer);
  renderSegment.resize(canvasSize, workBuffer);
}

function renderLoop() {
  if (samplesInfo.count < samplesInfo.limit) {
    computeSegment.compute();
    renderSegment.render();
  }
  requestAnimationFrame(renderLoop);
}

export function loadModel(path: string): void {}
