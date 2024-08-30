import { globals } from '$lib/C2';
import type { C2Scene } from '$lib/createScene';
import { previewSegmentShader } from '$lib/shaders/previewSegmentShader';

export class PreviewSegment {
  // private fields
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private pipeline: GPURenderPipeline;

  private bindGroup0!: GPUBindGroup;

  private vertexBuffer!: GPUBuffer;

  private scene!: C2Scene;
  private sceneUpdateRequired: boolean = false;
  private vertexCount: number = 0;

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
      }
    });
  }

  updateScene(scene: C2Scene) {
    this.scene = scene;
    this.sceneUpdateRequired = true;

    this.bindGroup0 = this.device.createBindGroup({
      label: 'preview bindgroup - camera matrices',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.scene.camera.cameraMatrixUniformBuffer } },
        { binding: 1, resource: { buffer: this.scene.camera.projectionMatrixUniformBuffer } }
      ]
    });
  }

  processScene() {
    this.vertexCount = 100 * 3;
    let vertexData = new Float32Array(this.vertexCount * 6);

    for (let i = 0; i < 100; i++) {
      let x = Math.random() * 2 - 1;
      let y = Math.random() * 2 - 1;
      let z = -Math.random() * 2 * 20;

      for (let j = 0; j < 3; j++) {
        let offx = -1,
          offy = 0;
        if (j == 1) {
          offx = +1;
          offy = 0;
        }
        if (j == 2) {
          offx = 0;
          offy = 2;
        }

        vertexData[(i * 3 + j) * 6 + 0] = x + offx * 0.03;
        vertexData[(i * 3 + j) * 6 + 1] = y + offy * 0.03;
        vertexData[(i * 3 + j) * 6 + 2] = z;
        vertexData[(i * 3 + j) * 6 + 3] = 0;
        vertexData[(i * 3 + j) * 6 + 4] = 0;
        vertexData[(i * 3 + j) * 6 + 5] = 0;
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

  render() {
    if (this.sceneUpdateRequired) {
      this.processScene();
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
      ]
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
