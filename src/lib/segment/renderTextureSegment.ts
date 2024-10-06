import { getBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';
import type { Vector2 } from 'three';
import { renderTextureShader } from '$lib/shaders/renderTextureShader';
import { globals } from '$lib/C2';

export class RenderTextureSegment {
  // private fields
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private pipeline: GPURenderPipeline;

  private bindGroup0: GPUBindGroup | null = null;

  private useTextureArrayUniform: GPUBuffer;
  private textureArrayIndexUniform: GPUBuffer;
  private sampler: GPUSampler;

  private default2Dtexture: GPUTexture;
  private default2DArrayTexture: GPUTexture;

  constructor(context: GPUCanvasContext, presentationFormat: GPUTextureFormat) {
    this.context = context;
    let device = globals.device;
    this.device = device;

    // *************** render pipeline ****************
    const module = device.createShaderModule({
      label: 'render texture shader',
      code: renderTextureShader
    });

    this.pipeline = device.createRenderPipeline({
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

    this.useTextureArrayUniform = device.createBuffer({
      size: 1 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.textureArrayIndexUniform = device.createBuffer({
      size: 1 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.sampler = this.device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'linear',
      minFilter: 'linear'
    });

    this.default2Dtexture = this.device.createTexture({
      size: [1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING
    });

    this.default2DArrayTexture = this.device.createTexture({
      size: [1, 1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING
    });
  }

  setTextureArray(texture: GPUTexture, index: number) {
    this.device.queue.writeBuffer(this.useTextureArrayUniform, 0, new Uint32Array([1]));
    this.device.queue.writeBuffer(this.textureArrayIndexUniform, 0, new Uint32Array([index]));

    // we need to re-create the bindgroup since workBuffer
    // is a new buffer
    this.bindGroup0 = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.default2Dtexture.createView() },
        { binding: 2, resource: texture.createView({ dimension: '2d-array' }) },
        { binding: 3, resource: { buffer: this.useTextureArrayUniform } },
        { binding: 4, resource: { buffer: this.textureArrayIndexUniform } }
      ]
    });
  }

  setTexture(texture: GPUTexture) {
    this.device.queue.writeBuffer(this.useTextureArrayUniform, 0, new Uint32Array([0]));

    // we need to re-create the bindgroup since workBuffer
    // is a new buffer
    this.bindGroup0 = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: texture.createView() },
        { binding: 2, resource: this.default2DArrayTexture.createView() },
        { binding: 3, resource: { buffer: this.useTextureArrayUniform } },
        { binding: 4, resource: { buffer: this.textureArrayIndexUniform } }
      ]
    });
  }

  // we should also create another function that simply uses an existing texture
  // instead of having to pass the textureData and create the texture here
  setTextureData(textureData: Float32Array, textureSize: Vector2) {
    const texture = this.device.createTexture({
      size: [textureSize.x, textureSize.y],
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });

    this.device.queue.writeBuffer(this.useTextureArrayUniform, 0, new Uint32Array([0]));

    this.device.queue.writeTexture(
      { texture },
      textureData,
      { bytesPerRow: textureSize.x * 16 },
      { width: textureSize.x, height: textureSize.y }
    );

    // we need to re-create the bindgroup since workBuffer
    // is a new buffer
    this.bindGroup0 = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: texture.createView() },
        { binding: 2, resource: this.default2DArrayTexture.createView() },
        { binding: 3, resource: { buffer: this.useTextureArrayUniform } },
        { binding: 4, resource: { buffer: this.textureArrayIndexUniform } }
      ]
    });
  }

  render() {
    if (!this.bindGroup0) {
      throw new Error('undefined render bind group');
    }

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
