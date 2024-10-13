import { vec2 } from '$lib/utils/math';
import type { Vector2 } from 'three';
import { resetShader } from '$lib/shaders/resetShader';
import { getComputeBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';

export class ResetSegment {
  // private fields
  private device: GPUDevice;
  private pipeline: GPUComputePipeline;

  private bindGroup0: GPUBindGroup | null = null;
  private canvasSizeUniformBuffer: GPUBuffer;

  private canvasSize: Vector2 | null = null;

  constructor(device: GPUDevice) {
    this.device = device;

    const resetModule = device.createShaderModule({
      label: 'reset module',
      code: resetShader
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [getComputeBindGroupLayout(device, ['storage', 'storage', 'uniform'])]
    });

    this.pipeline = device.createComputePipeline({
      label: 'reset pipeline',
      layout: pipelineLayout,
      compute: {
        module: resetModule,
        entryPoint: 'resetCanvas'
      }
    });

    // create a typedarray to hold the values for the uniforms in JavaScript
    this.canvasSizeUniformBuffer = device.createBuffer({
      size: 2 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
  }

  resize(canvasSize: Vector2, workBuffer: GPUBuffer, samplesCountBuffer: GPUBuffer) {
    this.canvasSize = canvasSize;

    this.device.queue.writeBuffer(
      this.canvasSizeUniformBuffer,
      0,
      new Uint32Array([canvasSize.x, canvasSize.y])
    );

    // we need to re-create the bindgroup since workBuffer
    // is a new buffer
    this.bindGroup0 = this.device.createBindGroup({
      label: 'reset bindgroup',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: workBuffer } },
        { binding: 1, resource: { buffer: samplesCountBuffer } },
        { binding: 2, resource: { buffer: this.canvasSizeUniformBuffer } }
      ]
    });
  }

  reset() {
    if (!this.bindGroup0 || !this.canvasSize) {
      throw new Error('undefined bind groups or canvasSize');
    }

    // work group size in the shader is set to 8,8
    const workGroupsCount = vec2(
      Math.ceil(this.canvasSize.x / 8),
      Math.ceil(this.canvasSize.y / 8)
    );

    // Encode commands to do the computation
    const encoder = this.device.createCommandEncoder({
      label: 'reset encoder'
    });
    const pass = encoder.beginComputePass({
      label: 'reset pass'
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup0);
    pass.dispatchWorkgroups(workGroupsCount.x, workGroupsCount.y);
    pass.end();

    // Finish encoding and submit the commands
    const computeCommandBuffer = encoder.finish();
    this.device.queue.submit([computeCommandBuffer]);
  }
}
