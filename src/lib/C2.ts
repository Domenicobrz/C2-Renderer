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



  // next step: create a segment for the compute pass, 
  // handle canvas resizes,
  // and use arbitrary texture sizes, not limited to 8x8



  const input = new Float32Array(8 * 8 * 4);
  const workBuffer = device.createBuffer({
    label: 'work buffer',
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(workBuffer, 0, input);

  const resultBuffer = device.createBuffer({
    label: 'result buffer',
    size: input.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  });





  // *************** compute pipeline ****************
  const computeModule = device.createShaderModule({
    label: 'compute module',
    code: /*wgsl*/`
      @group(0) @binding(0) var<storage, read_write> data: array<vec3f>;
 
      @compute @workgroup_size(8, 8) fn computeSomething(
        @builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>,
      ) {
        let idx = lid.y * 8 + lid.x;
        data[idx] = vec3f(
          sin(f32(lid.x) * 0.75) * 0.5 + 0.5, 
          cos(f32(lid.y) * 0.75) * 0.5 + 0.5, 
          0
        );
      }
    `,
  });

  const computePipeline = device.createComputePipeline({
    label: 'compute pipeline',
    layout: 'auto',
    compute: {
      module: computeModule,
      entryPoint: 'computeSomething',
    },
  });

  const computeBindGroup = device.createBindGroup({
    label: 'compute bindgroup',
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: workBuffer } },
    ],
  });


  // *************** render pipeline ****************
  const renderSegment = new RenderSegment(device, context, presentationFormat);
  // we need to resize before we're able to render
  renderSegment.resize(8, 8, workBuffer);



  // Encode commands to do the computation
  const encoder = device.createCommandEncoder({
    label: 'doubling encoder',
  });
  const pass = encoder.beginComputePass({
    label: 'doubling compute pass',
  });
  pass.setPipeline(computePipeline);
  pass.setBindGroup(0, computeBindGroup);
  pass.dispatchWorkgroups(1);
  pass.end();

  // Encode a command to copy the results to a mappable buffer.
  encoder.copyBufferToBuffer(workBuffer, 0, resultBuffer, 0, resultBuffer.size);

  // Finish encoding and submit the commands
  const computeCommandBuffer = encoder.finish();
  device.queue.submit([computeCommandBuffer]);


  // ******************** render to canvas ********************
  renderSegment.render();
}

export function loadModel(path: string): void {

}