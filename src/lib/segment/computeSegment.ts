import { computeShader } from "$lib/shaders/computeShader";
import { vec2 } from "$lib/utils";
import type { Vector2 } from "three";

export class ComputeSegment {
  // private fields
  #device: GPUDevice;
  #pipeline: GPUComputePipeline;

  #bindGroup0: GPUBindGroup | null;

  #canvasSize: Vector2 | null;
  #canvasSizeUniformBuffer: GPUBuffer;

  constructor(device: GPUDevice) {
    this.#bindGroup0 = null;
    this.#canvasSize = null;

    this.#device = device;

    const computeModule = device.createShaderModule({
      label: 'compute module',
      code: computeShader,
    });

    this.#pipeline = device.createComputePipeline({
      label: 'compute pipeline',
      layout: 'auto',
      compute: {
        module: computeModule,
        entryPoint: 'computeSomething',
      },
    });

    // create a typedarray to hold the values for the uniforms in JavaScript
    this.#canvasSizeUniformBuffer = device.createBuffer({
      size: 2 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
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
        { binding: 1, resource: { buffer: this.#canvasSizeUniformBuffer } },
      ],
    });
  }

  compute() {
    if (!this.#bindGroup0 || !this.#canvasSize) {
      throw new Error("undefined bind group 0 or canvasSize");
    }

    if (this.#canvasSize.x === 0 || this.#canvasSize.y === 0) throw new Error("canvas size dimensions is 0");

    // work group size in the shader is set to 8,8
    const workGroupsCount = vec2(
      Math.ceil(this.#canvasSize.x / 8),
      Math.ceil(this.#canvasSize.y / 8),
    );

    // Encode commands to do the computation
    const encoder = this.#device.createCommandEncoder({
      label: 'compute encoder',
    });
    const pass = encoder.beginComputePass({
      label: 'compute pass',
    });
    pass.setPipeline(this.#pipeline);
    pass.setBindGroup(0, this.#bindGroup0);
    pass.dispatchWorkgroups(workGroupsCount.x, workGroupsCount.y);
    pass.end();

    // Finish encoding and submit the commands
    const computeCommandBuffer = encoder.finish();
    this.#device.queue.submit([computeCommandBuffer]);
  }
}