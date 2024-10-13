import { globals } from '$lib/C2';
import { Camera } from '$lib/controls/Camera';
import type { C2Scene } from '$lib/createScene';
import { renderShader } from '$lib/shaders/renderShader';
import { getFragmentBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';
import type { Vector2 } from 'three';

export class RenderSegment {
  // private fields
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private pipeline: GPURenderPipeline;

  private bindGroup0: GPUBindGroup | null = null;

  private canvasSize: Vector2 | null;
  private canvasSizeUniformBuffer: GPUBuffer;

  private scene!: C2Scene;
  private camera!: Camera;

  constructor(context: GPUCanvasContext, presentationFormat: GPUTextureFormat) {
    this.canvasSize = null;

    this.context = context;

    let device = globals.device;
    this.device = device;

    // *************** render pipeline ****************
    const module = device.createShaderModule({
      label: 'render shader',
      code: renderShader
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [
        getFragmentBindGroupLayout(device, [
          'read-only-storage',
          'read-only-storage',
          'uniform',
          'uniform'
        ])
      ]
    });

    this.pipeline = device.createRenderPipeline({
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
    this.canvasSizeUniformBuffer = device.createBuffer({
      size: 2 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
  }

  updateScene(scene: C2Scene) {
    this.scene = scene;
    this.camera = scene.camera;
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
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: workBuffer, size: workBuffer.size } },
        { binding: 1, resource: { buffer: samplesCountBuffer, size: samplesCountBuffer.size } },
        { binding: 2, resource: { buffer: this.canvasSizeUniformBuffer } },
        { binding: 3, resource: { buffer: this.camera.exposureUniformBuffer! } }
      ]
    });
  }

  render() {
    if (!this.bindGroup0 || !this.canvasSize) {
      throw new Error('undefined render bind group');
    }

    if (this.canvasSize.x === 0 || this.canvasSize.y === 0)
      throw new Error('canvas size dimensions is 0');

    // Get the current texture from the canvas context and
    // set it as the texture to render to.
    const passDescriptor: GPURenderPassDescriptor = {
      label: 'our basic canvas renderPass',
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    };

    const encoder = this.device.createCommandEncoder({ label: 'render encoder' });
    const pass = encoder.beginRenderPass(passDescriptor);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup0);
    pass.draw(6); // call our vertex shader 6 times
    pass.end();

    const commandBuffer = encoder.finish();
    this.device.queue.submit([commandBuffer]);
  }
}
