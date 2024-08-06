import { getBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';
import type { Vector2 } from 'three';
import { renderTextureShader } from '$lib/shaders/renderTextureShader';

export class RenderTextureSegment {
  // private fields
  #device: GPUDevice;
  #context: GPUCanvasContext;
  #pipeline: GPURenderPipeline;

  #bindGroup0: GPUBindGroup | null = null;

  constructor(device: GPUDevice, context: GPUCanvasContext, presentationFormat: GPUTextureFormat) {
    this.#context = context;
    this.#device = device;

    // *************** render pipeline ****************
    const module = device.createShaderModule({
      label: 'render texture shader',
      code: renderTextureShader
    });

    this.#pipeline = device.createRenderPipeline({
      label: 'render texture pipeline',
      layout: 'auto',
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
  }

  // we should also create another function that simply uses an existing texture
  // instead of having to pass the textureData and create the texture here
  setTextureData(textureData: Float32Array, textureSize: Vector2) {
    const texture = this.#device.createTexture({
      size: [textureSize.x, textureSize.y],
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });

    this.#device.queue.writeTexture(
      { texture },
      textureData,
      { bytesPerRow: textureSize.x * 16 },
      { width: textureSize.x, height: textureSize.y }
    );

    const sampler = this.#device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'linear',
      minFilter: 'linear'
    });

    // we need to re-create the bindgroup since workBuffer
    // is a new buffer
    this.#bindGroup0 = this.#device.createBindGroup({
      layout: this.#pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: texture.createView() }
      ]
    });
  }

  render() {
    if (!this.#bindGroup0) {
      throw new Error('undefined render bind group');
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
          storeOp: 'store'
        }
      ]
    };

    const encoder = this.#device.createCommandEncoder({ label: 'render encoder' });
    const pass = encoder.beginRenderPass(passDescriptor);
    pass.setPipeline(this.#pipeline);
    pass.setBindGroup(0, this.#bindGroup0);
    pass.draw(6); // call our vertex shader 6 times
    pass.end();

    const commandBuffer = encoder.finish();
    this.#device.queue.submit([commandBuffer]);
  }
}
