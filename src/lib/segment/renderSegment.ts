import { renderShader } from "$lib/shaders/renderShader";

export class RenderSegment {
  // private fields
  #device: GPUDevice;
  #context: GPUCanvasContext;
  #pipeline: GPURenderPipeline;

  #renderBindGroup: GPUBindGroup | null;

  constructor(device: GPUDevice, context: GPUCanvasContext, presentationFormat: GPUTextureFormat) {
    this.#renderBindGroup = null;

    this.#context = context;
    this.#device = device;

    // *************** render pipeline ****************
    const renderModule = device.createShaderModule({
      label: 'render shader',
      code: renderShader,
    });

    const renderBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: {
            type: "read-only-storage"
          },
        },
      ],
    });

    const renderPipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [renderBindGroupLayout]
    });

    this.#pipeline = device.createRenderPipeline({
      label: 'render pipeline',
      layout: renderPipelineLayout,
      vertex: {
        module: renderModule,
        entryPoint: 'vs',
      },
      fragment: {
        module: renderModule,
        entryPoint: 'fs',
        targets: [{ format: presentationFormat }],
      },
    });
  }

  resize(width: number, height: number, workBuffer: GPUBuffer) {
    this.#renderBindGroup = this.#device.createBindGroup({
      layout: this.#pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: workBuffer, size: workBuffer.size, } },
      ],
    });
  }

  render() {
    if (!this.#renderBindGroup) {
      throw new Error("undefined render bind group");
    }

    // Get the current texture from the canvas context and
    // set it as the texture to render to.
    const passDescriptor: GPURenderPassDescriptor = {
      label: 'our basic canvas renderPass',
      colorAttachments: [
        {
          view: this.#context.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };

    const encoder = this.#device.createCommandEncoder({ label: 'render encoder' });
    const pass = encoder.beginRenderPass(passDescriptor);
    pass.setPipeline(this.#pipeline);
    pass.setBindGroup(0, this.#renderBindGroup);
    pass.draw(6);  // call our vertex shader 6 times
    pass.end();

    const commandBuffer = encoder.finish();
    this.#device.queue.submit([commandBuffer]);
  }
}