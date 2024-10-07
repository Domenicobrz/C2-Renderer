import { getBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';
import { TextureLoader, Vector2 } from 'three';
import { renderTextureShader } from '$lib/shaders/renderTextureShader';
import { globals } from '$lib/C2';
import { textureArraysSegmentShader } from '$lib/shaders/textureArraysShader';
import type { C2Scene } from '$lib/createScene';
import type { Material } from '$lib/materials/Material';

type ImageInfo = {
  image: HTMLImageElement;
  flipY: boolean;
};

export class TextureArraysSegment {
  // private fields
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private pipeline: GPURenderPipeline;

  private renderSampler: GPUSampler;
  private bindGroup0: GPUBindGroup | null = null;

  public sampler: GPUSampler;
  public textures128: GPUTexture;
  public textures512: GPUTexture;
  public textures1024: GPUTexture;

  constructor() {
    this.context = globals.context;
    let device = globals.device;
    this.device = device;

    const module = this.device.createShaderModule({
      label: 'render texture shader',
      code: textureArraysSegmentShader
    });

    this.pipeline = device.createRenderPipeline({
      label: 'mip level generator pipeline',
      layout: 'auto',
      vertex: {
        module
      },
      fragment: {
        module,
        targets: [{ format: 'rgba8unorm' }]
      }
    });

    this.renderSampler = this.device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'linear',
      minFilter: 'linear'
    });

    this.sampler = this.device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'linear',
      minFilter: 'linear'
    });

    this.textures128 = this.device.createTexture({
      label: 'dummy texture array segment 128 texture',
      size: [1, 1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING
    });
    this.textures512 = this.device.createTexture({
      label: 'dummy texture array segment 512 texture',
      size: [1, 1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING
    });
    this.textures1024 = this.device.createTexture({
      label: 'dummy texture array segment 1024 texture',
      size: [1, 1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING
    });
  }

  update(materials: Material[]) {
    let textures128count = 0;
    let images128: ImageInfo[] = [];
    let textures512count = 0;
    let images512: ImageInfo[] = [];
    let textures1024count = 0;
    let images1024: ImageInfo[] = [];

    for (let i = 0; i < materials.length; i++) {
      let material = materials[i];
      for (let tname in material.textures) {
        let t = material.textures[tname];
        let dim = Math.max(t.width, t.height);

        if (dim <= 128) {
          material.texturesLocation[tname] = new Vector2(0, textures128count);
          textures128count++;
          images128.push({ image: t, flipY: material.flipTextureY });
        } else if (dim <= 512) {
          material.texturesLocation[tname] = new Vector2(1, textures512count);
          textures512count++;
          images512.push({ image: t, flipY: material.flipTextureY });
        } else {
          material.texturesLocation[tname] = new Vector2(2, textures1024count);
          textures1024count++;
          images1024.push({ image: t, flipY: material.flipTextureY });
        }
      }
    }

    if (textures128count > 0) {
      this.textures128 = this.device.createTexture({
        label: 'texture array segment 128 texture',
        size: [128, 128, textures128count],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST
      });
    }

    if (textures512count > 0) {
      this.textures512 = this.device.createTexture({
        label: 'texture array segment 512 texture',
        size: [512, 512, textures512count],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST
      });
    }

    if (textures1024count > 0) {
      this.textures1024 = this.device.createTexture({
        label: 'texture array segment 1024 texture',
        size: [1024, 1024, textures1024count],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST
      });
    }

    const renderTextureInsideTextureArray = async (
      size: '128' | '512' | '1024',
      arrayIndex: number,
      imgInfo: ImageInfo
    ) => {
      // this workaround of transforming first the image to
      // an image bitmap is required for macos where copyExternalImageToTexture
      // doesn't work otherwise
      const canvas = document.createElement('canvas');
      canvas.width = imgInfo.image.width;
      canvas.height = imgInfo.image.height;
      const ctx = canvas.getContext('2d');
      ctx!.drawImage(imgInfo.image, 0, 0);
      const bitmap = await createImageBitmap(canvas);

      const texture = this.device.createTexture({
        size: [imgInfo.image.width, imgInfo.image.height],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST
      });

      this.device.queue.copyExternalImageToTexture(
        { source: bitmap, flipY: imgInfo.flipY },
        { texture },
        { width: imgInfo.image.width, height: imgInfo.image.height }
      );

      this.bindGroup0 = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.renderSampler },
          { binding: 1, resource: texture.createView() }
        ]
      });

      let textureArray = this.textures128;
      if (size == '512') {
        textureArray = this.textures512;
      }
      if (size == '1024') {
        textureArray = this.textures1024;
      }

      this.render(textureArray, arrayIndex);
    };

    images128.forEach((image, index) => {
      renderTextureInsideTextureArray('128', index, image);
    });
    images512.forEach((image, index) => {
      renderTextureInsideTextureArray('512', index, image);
    });
    images1024.forEach((image, index) => {
      renderTextureInsideTextureArray('1024', index, image);
    });
  }

  render(arrayTexture: GPUTexture, layerIndex: number) {
    if (!this.bindGroup0) {
      throw new Error('undefined render bind group');
    }

    // Get the current texture from the canvas context and
    // set it as the texture to render to.
    const passDescriptor: GPURenderPassDescriptor = {
      label: 'our basic canvas renderPass',
      colorAttachments: [
        {
          view: arrayTexture.createView({
            dimension: '2d-array',
            baseArrayLayer: layerIndex,
            arrayLayerCount: 1
          }),
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
