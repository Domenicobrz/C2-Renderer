import { computeShader } from '$lib/shaders/computeShader';
import { vec2 } from '$lib/utils';
import type { Matrix3, Matrix4, Vector2, Vector3 } from 'three';

export class ComputeSegment {
  // private fields
  #device: GPUDevice;
  #pipeline: GPUComputePipeline;

  #bindGroup0: GPUBindGroup | null;
  #bindGroup1: GPUBindGroup | null;

  #canvasSize: Vector2 | null;
  #canvasSizeUniformBuffer: GPUBuffer;
  #cameraUniformBuffer: GPUBuffer;

  constructor(device: GPUDevice) {
    this.#bindGroup0 = null;
    this.#bindGroup1 = null;
    this.#canvasSize = null;

    this.#device = device;

    const computeModule = device.createShaderModule({
      label: 'compute module',
      code: computeShader
    });

    this.#pipeline = device.createComputePipeline({
      label: 'compute pipeline',
      layout: 'auto',
      compute: {
        module: computeModule,
        entryPoint: 'computeSomething'
      }
    });

    // create a typedarray to hold the values for the uniforms in JavaScript
    this.#canvasSizeUniformBuffer = device.createBuffer({
      size: 2 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.#cameraUniformBuffer = device.createBuffer({
      size: 4 * 16 /* determined with offset computer */,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
  }

  updateCamera(position: Vector3, fov: number, rotationMatrix: Matrix4) {
    this.#device.queue.writeBuffer(
      this.#cameraUniformBuffer,
      0,
      new Float32Array([
        position.x,
        position.y,
        position.z,
        fov,
        rotationMatrix.elements[0],
        rotationMatrix.elements[1],
        rotationMatrix.elements[2],
        0,
        rotationMatrix.elements[4],
        rotationMatrix.elements[5],
        rotationMatrix.elements[6],
        0,
        rotationMatrix.elements[8],
        rotationMatrix.elements[9],
        rotationMatrix.elements[10],
        0
      ])
    );

    // we need to re-create the bindgroup since cameraUniformBuffer
    // is a new buffer
    this.#bindGroup1 = this.#device.createBindGroup({
      label: 'compute bindgroup - camera struct',
      layout: this.#pipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: this.#cameraUniformBuffer } }]
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
      label: 'compute bindgroup',
      layout: this.#pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: workBuffer } },
        { binding: 1, resource: { buffer: this.#canvasSizeUniformBuffer } }
      ]
    });
  }

  compute() {
    if (!this.#bindGroup0 || !this.#bindGroup1 || !this.#canvasSize) {
      throw new Error('undefined bind groups or canvasSize');
    }

    if (this.#canvasSize.x === 0 || this.#canvasSize.y === 0)
      throw new Error('canvas size dimensions is 0');

    // work group size in the shader is set to 8,8
    const workGroupsCount = vec2(
      Math.ceil(this.#canvasSize.x / 8),
      Math.ceil(this.#canvasSize.y / 8)
    );

    // Encode commands to do the computation
    const encoder = this.#device.createCommandEncoder({
      label: 'compute encoder'
    });
    const pass = encoder.beginComputePass({
      label: 'compute pass'
    });
    pass.setPipeline(this.#pipeline);
    pass.setBindGroup(0, this.#bindGroup0);
    pass.setBindGroup(1, this.#bindGroup1);
    pass.dispatchWorkgroups(workGroupsCount.x, workGroupsCount.y);
    pass.end();

    // Finish encoding and submit the commands
    const computeCommandBuffer = encoder.finish();
    this.#device.queue.submit([computeCommandBuffer]);
  }
}
