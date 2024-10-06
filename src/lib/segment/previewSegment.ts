import { globals } from '$lib/C2';
import type { C2Scene } from '$lib/createScene';
import { previewSegmentShader } from '$lib/shaders/previewSegmentShader';
import { Vector2 } from 'three';

export class PreviewSegment {
  // private fields
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private pipeline: GPURenderPipeline;

  private bindGroup0!: GPUBindGroup;

  private vertexBuffer!: GPUBuffer;
  private renderModeBuffer: GPUBuffer;

  private depthStencilAttachment: GPURenderPassDepthStencilAttachment | null = null;

  private scene!: C2Scene;
  private sceneUpdateRequired: boolean = false;
  private vertexCount: number = 0;
  private renderMode: 'normal' | 'camera-light' = 'normal';

  constructor(context: GPUCanvasContext, presentationFormat: GPUTextureFormat) {
    this.context = context;
    let device = globals.device;
    this.device = device;

    // *************** render pipeline ****************
    const module = device.createShaderModule({
      label: 'preview segment shader',
      code: previewSegmentShader
    });

    this.pipeline = device.createRenderPipeline({
      label: 'preview segment pipeline',
      layout: 'auto',
      vertex: {
        module,
        buffers: [
          // we could also create two separate buffers instead of
          // interleaving the position and normal attributes,
          // this could be useful for instance attributes or
          // attributes that change less often compared to other ones,
          // in this case there's no particular advantage to create two
          // separate buffers
          {
            // vec3 position, vec3 normal
            arrayStride: 6 * 4, // 6 floats, 4 bytes each
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
              { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' } // position
            ]
          }
        ],
        entryPoint: 'vs'
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: presentationFormat }]
      },
      depthStencil: {
        format: 'depth24plus-stencil8',
        depthWriteEnabled: true,
        depthCompare: 'less-equal'
      },
      primitive: {
        cullMode: 'none'
      }
    });

    // create a typedarray to hold the values for the uniforms in JavaScript
    this.renderModeBuffer = device.createBuffer({
      size: 1 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
  }

  createDepthBufferResources(canvasSize: Vector2) {
    let size: GPUExtent3D = {
      width: canvasSize.x,
      height: canvasSize.y,
      depthOrArrayLayers: 1
    };
    let descriptor: GPUTextureDescriptor = {
      size,
      format: 'depth24plus-stencil8',
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    };
    let depthStencilBuffer = this.device.createTexture(descriptor);
    let depthStencilView = depthStencilBuffer.createView();
    this.depthStencilAttachment = {
      view: depthStencilView,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
      stencilLoadOp: 'clear',
      stencilStoreOp: 'discard' // we're not using stencil stuff
    };
  }

  resize(canvasSize: Vector2) {
    this.createDepthBufferResources(canvasSize);
  }

  updateScene(scene: C2Scene) {
    this.scene = scene;
    this.sceneUpdateRequired = true;

    this.bindGroup0 = this.device.createBindGroup({
      label: 'preview bindgroup - camera matrices',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.scene.camera.cameraMatrixUniformBuffer } },
        { binding: 1, resource: { buffer: this.scene.camera.projectionMatrixUniformBuffer } },
        { binding: 2, resource: { buffer: this.scene.camera.cameraPositionUniformBuffer } },
        { binding: 3, resource: { buffer: this.renderModeBuffer } }
      ]
    });
  }

  processScene() {
    this.vertexCount = this.scene.triangles.length * 3;
    let vertexData = new Float32Array(this.vertexCount * 6);

    for (let i = 0; i < this.scene.triangles.length; i++) {
      let triangle = this.scene.triangles[i];
      let vs = [triangle.v0, triangle.v1, triangle.v2];

      for (let j = 0; j < 3; j++) {
        vertexData[(i * 3 + j) * 6 + 0] = vs[j].x;
        vertexData[(i * 3 + j) * 6 + 1] = vs[j].y;
        vertexData[(i * 3 + j) * 6 + 2] = vs[j].z;
        vertexData[(i * 3 + j) * 6 + 3] = (triangle as any)['norm' + j].x;
        vertexData[(i * 3 + j) * 6 + 4] = (triangle as any)['norm' + j].y;
        vertexData[(i * 3 + j) * 6 + 5] = (triangle as any)['norm' + j].z;
      }
    }

    this.vertexBuffer = this.device.createBuffer({
      label: 'preview segment vertex buffer',
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, vertexData);

    this.sceneUpdateRequired = false;
  }

  setMode(mode: 'normal' | 'camera-light') {
    if (mode == this.renderMode) return;
    this.renderMode = mode;

    this.device.queue.writeBuffer(
      this.renderModeBuffer,
      0,
      new Float32Array([this.renderMode == 'normal' ? 0 : 1])
    );
  }

  render() {
    if (this.sceneUpdateRequired) {
      this.processScene();
    }

    if (!this.depthStencilAttachment) {
      throw new Error('missing depth stencil attachment');
    }

    let renderPassDescriptor: GPURenderPassDescriptor = {
      label: 'preview segment renderPass',
      colorAttachments: [
        {
          clearValue: [0.3, 0.3, 0.3, 1],
          loadOp: 'clear',
          storeOp: 'store',
          view: this.context.getCurrentTexture().createView()
        }
      ],
      depthStencilAttachment: this.depthStencilAttachment
    };

    // make a command encoder to start encoding commands
    const encoder = this.device.createCommandEncoder({ label: 'preview segment encoder' });

    // make a render pass encoder to encode render specific commands
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup0);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.vertexCount); // call our vertex shader 3 times.
    pass.end();

    const commandBuffer = encoder.finish();
    this.device.queue.submit([commandBuffer]);
  }
}
