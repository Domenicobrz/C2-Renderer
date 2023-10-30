import { ComputeSegment } from "./segment/computeSegment";
import { RenderSegment } from "./segment/renderSegment";

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
    format: presentationFormat,
  });



  // next step: 
  // handle canvas resizes,
  // and use arbitrary texture sizes, not limited to 8x8



  const input = new Float32Array(8 * 8 * 4);
  const workBuffer = device.createBuffer({
    label: 'work buffer',
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(workBuffer, 0, input);




  // *************** compute pipeline ****************
  const computeSegment = new ComputeSegment(device);
  const renderSegment = new RenderSegment(device, context, presentationFormat);

  // we need to resize before we're able to render
  computeSegment.resize(8, 8, workBuffer);
  renderSegment.resize(8, 8, workBuffer);

  computeSegment.compute();
  renderSegment.render();
}

export function loadModel(path: string): void {

}