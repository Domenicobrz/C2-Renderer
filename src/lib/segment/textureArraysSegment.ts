import { getBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';
import { TextureLoader, type Vector2 } from 'three';
import { renderTextureShader } from '$lib/shaders/renderTextureShader';
import { globals } from '$lib/C2';
import { textureArraysSegmentShader } from '$lib/shaders/textureArraysShader';
import { C2Scene } from '$lib/createScene';

export class RenderTextureSegment {
  // private fields
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private pipeline: GPURenderPipeline;

  private sampler: GPUSampler;
  private bindGroup0: GPUBindGroup | null = null;
  private textures512: GPUTexture | null = null;

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

    this.sampler = this.device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'linear',
      minFilter: 'linear'
    });
  }

  updateScene(scene: C2Scene) {
    (async () => {
      let threeTextures = [await new TextureLoader().loadAsync('favicon.png')];

      const textures512count = threeTextures.length;

      this.textures512 = this.device.createTexture({
        size: [512, 512, textures512count],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST
      });

      for (let i = 0; i < textures512count; i++) {
        let htmlImg = threeTextures[i].source.data as HTMLImageElement;

        const texture = this.device.createTexture({
          size: [htmlImg.width, htmlImg.height],
          format: 'rgba8unorm',
          usage:
            GPUTextureUsage.RENDER_ATTACHMENT |
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST
        });

        this.device.queue.copyExternalImageToTexture(
          { source: htmlImg, flipY: true },
          { texture },
          { width: htmlImg.width, height: htmlImg.height }
        );

        // now we have to create the render stuff to
        // now we have to create the render stuff to
        // now we have to create the render stuff to
        // now we have to create the render stuff to
        // now we have to create the render stuff to render into the array layer
        // also remember that you can create all the bindgroups in advance,
        // so that you can use them later in case this could be useful
      }
    })();
  }

  // setTexture(texture: GPUTexture) {
  //   // we need to re-create the bindgroup since workBuffer
  //   // is a new buffer
  //   this.bindGroup0 = this.device.createBindGroup({
  //     layout: this.pipeline.getBindGroupLayout(0),
  //     entries: [
  //       { binding: 0, resource: sampler },
  //       { binding: 1, resource: texture.createView() }
  //     ]
  //   });
  // }

  // render() {
  //   if (!this.bindGroup0) {
  //     throw new Error('undefined render bind group');
  //   }

  //   // Get the current texture from the canvas context and
  //   // set it as the texture to render to.
  //   const passDescriptor: GPURenderPassDescriptor = {
  //     label: 'our basic canvas renderPass',
  //     colorAttachments: [
  //       {
  //         view: this.context.getCurrentTexture().createView(),
  //         clearValue: [0, 0, 0, 1],
  //         loadOp: 'clear',
  //         storeOp: 'store'
  //       }
  //     ]
  //   };

  //   const encoder = this.device.createCommandEncoder({ label: 'render encoder' });
  //   const pass = encoder.beginRenderPass(passDescriptor);
  //   pass.setPipeline(this.pipeline);
  //   pass.setBindGroup(0, this.bindGroup0);
  //   pass.draw(6); // call our vertex shader 6 times
  //   pass.end();

  //   const commandBuffer = encoder.finish();
  //   this.device.queue.submit([commandBuffer]);
  // }
}
