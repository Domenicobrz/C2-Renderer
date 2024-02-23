import { renderShader } from '$lib/shaders/renderShader';
import { getBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';
import type { Vector2 } from 'three';
import { samplesInfo } from '../../routes/stores/main';

export class RenderSegment {
  // private fields
  #device: GPUDevice;
  #context: GPUCanvasContext;
  #pipeline: GPURenderPipeline;

  #bindGroup0: GPUBindGroup | null = null;
  #bindGroup1: GPUBindGroup | null = null;

  #canvasSize: Vector2 | null;
  #canvasSizeUniformBuffer: GPUBuffer;

  #samplesCountUniformBuffer: GPUBuffer;

  constructor(device: GPUDevice, context: GPUCanvasContext, presentationFormat: GPUTextureFormat) {
    this.#canvasSize = null;

    this.#context = context;
    this.#device = device;

    // *************** render pipeline ****************
    const module = device.createShaderModule({
      label: 'render shader',
      code: renderShader
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [
        getBindGroupLayout(device, [
          { visibility: GPUShaderStage.FRAGMENT, type: 'read-only-storage' },
          { visibility: GPUShaderStage.FRAGMENT, type: 'uniform' }
        ]),
        getBindGroupLayout(device, [{ visibility: GPUShaderStage.FRAGMENT, type: 'uniform' }])
      ]
    });

    this.#pipeline = device.createRenderPipeline({
      label: 'render pipeline',
      layout: pipelineLayout,
      vertex: {
        module,
        entryPoint: 'vs'
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: presentationFormat }]
      }
    });

    // create a typedarray to hold the values for the uniforms in JavaScript
    this.#canvasSizeUniformBuffer = device.createBuffer({
      size: 2 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.#samplesCountUniformBuffer = device.createBuffer({
      size: 1 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
  }

  resize(canvasSize: Vector2, workBuffer: GPUBuffer) {
    this.#canvasSize = canvasSize;

    this.#device.queue.writeBuffer(
      this.#canvasSizeUniformBuffer,
      0,
      new Uint32Array([canvasSize.x, canvasSize.y])
    );

    // we need to re-create the bindgroup since workBuffer
    // is a new buffer
    this.#bindGroup0 = this.#device.createBindGroup({
      layout: this.#pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: workBuffer, size: workBuffer.size } },
        { binding: 1, resource: { buffer: this.#canvasSizeUniformBuffer } }
      ]
    });
  }

  #updateSamplesCountBuffer() {
    this.#device.queue.writeBuffer(
      this.#samplesCountUniformBuffer,
      0,
      new Uint32Array([samplesInfo.count])
    );

    // we need to re-create the bindgroup since samplesCount
    // is a new buffer
    this.#bindGroup1 = this.#device.createBindGroup({
      layout: this.#pipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: this.#samplesCountUniformBuffer } }]
    });
  }

  async render() {
    this.#updateSamplesCountBuffer();

    if (!this.#bindGroup0 || !this.#bindGroup1 || !this.#canvasSize) {
      throw new Error('undefined render bind group');
    }

    if (this.#canvasSize.x === 0 || this.#canvasSize.y === 0)
      throw new Error('canvas size dimensions is 0');

    // Get the current texture from the canvas context and
    // set it as the texture to render to.
    const passDescriptor: GPURenderPassDescriptor = {
      label: 'our basic canvas renderPass',
      colorAttachments: [
        {
          view: this.#context.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    };

    const encoder = this.#device.createCommandEncoder({ label: 'render encoder' });
    const pass = encoder.beginRenderPass(passDescriptor);
    pass.setPipeline(this.#pipeline);
    pass.setBindGroup(0, this.#bindGroup0);
    pass.setBindGroup(1, this.#bindGroup1);
    pass.draw(6); // call our vertex shader 6 times
    pass.end();

    const commandBuffer = encoder.finish();
    this.#device.queue.submit([commandBuffer]);
    await this.#device.queue.onSubmittedWorkDone();
  }
}
