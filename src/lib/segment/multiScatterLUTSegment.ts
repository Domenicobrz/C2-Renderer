import { getComputeShader } from '$lib/shaders/computeShader';
import { Vector2 } from 'three';
import { globals } from '$lib/C2';
import { multiScatterLUTShader } from '$lib/shaders/multiScatterLUTShader';
import { getComputeBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';

export class MultiScatterLUTSegment {
  // private fields
  private device: GPUDevice;
  private pipeline: GPUComputePipeline | null = null;
  private bindGroupLayouts: GPUBindGroupLayout[];
  private layout: GPUPipelineLayout;

  private bindGroup0: GPUBindGroup | null = null;

  private LUTSize: Vector2 = new Vector2(-1, -1);

  constructor() {
    let device = globals.device;
    this.device = device;

    this.bindGroupLayouts = [getComputeBindGroupLayout(device, ['storage', 'uniform'])];
    this.layout = device.createPipelineLayout({
      label: 'multi-scatter LUT - pipeline layout',
      bindGroupLayouts: this.bindGroupLayouts
    });
  }

  setSize(size: Vector2) {
    this.LUTSize = size;

    let LUTSizeUniformBuffer = this.device.createBuffer({
      size: 2 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(
      LUTSizeUniformBuffer,
      0,
      new Uint32Array([this.LUTSize.x, this.LUTSize.y])
    );

    const input = new Float32Array(size.x * size.y);
    const workBuffer = this.device.createBuffer({
      label: 'multi-scatter LUT - work buffer',
      size: input.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(workBuffer, 0, input);

    this.bindGroup0 = this.device.createBindGroup({
      label: 'multi-scatter LUT - compute bindgroup',
      layout: this.bindGroupLayouts[0],
      entries: [
        { binding: 0, resource: { buffer: workBuffer } },
        { binding: 1, resource: { buffer: LUTSizeUniformBuffer } }
      ]
    });
  }

  createPipeline() {
    const computeModule = this.device.createShaderModule({
      label: 'multi-scatter LUT compute module',
      code: multiScatterLUTShader
    });

    this.pipeline = this.device.createComputePipeline({
      label: 'multi-scatter LUT compute pipeline',
      layout: this.layout,
      compute: {
        module: computeModule,
        entryPoint: 'compute'
      }
    });
  }

  compute() {
    if (!this.pipeline || !this.bindGroup0 || !this.LUTSize) {
      throw new Error('undefined bind groups / pipeline / canvasSize');
    }

    // work group size in the shader is set to 8,8
    const workGroupsCount = new Vector2(
      Math.ceil(this.LUTSize.x / 8),
      Math.ceil(this.LUTSize.y / 8)
    );

    // Encode commands to do the computation
    const encoder = this.device.createCommandEncoder({
      label: 'multi-scatter lut compute encoder'
    });
    const passDescriptor = {
      label: 'multi-scatter lut compute pass'
    };
    const pass = encoder.beginComputePass(passDescriptor);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup0);
    pass.dispatchWorkgroups(workGroupsCount.x, workGroupsCount.y);
    pass.end();

    // Finish encoding and submit the commands
    const computeCommandBuffer = encoder.finish();
    this.device.queue.submit([computeCommandBuffer]);
  }
}
