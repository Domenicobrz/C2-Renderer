import { computeShader } from "$lib/shaders/computeShader";

export class ComputeSegment {
  // private fields
  #device: GPUDevice;
  #pipeline: GPUComputePipeline;

  #bindGroup0: GPUBindGroup | null;

  constructor(device: GPUDevice) {
    this.#bindGroup0 = null;

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
  }

  resize(width: number, height: number, workBuffer: GPUBuffer) {
    this.#bindGroup0 = this.#device.createBindGroup({
      label: 'compute bindgroup',
      layout: this.#pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: workBuffer } },
      ],
    });
  }

  compute() {
    if (!this.#bindGroup0) {
      throw new Error("undefined bind group 0");
    }

    // Encode commands to do the computation
    const encoder = this.#device.createCommandEncoder({
      label: 'compute encoder',
    });
    const pass = encoder.beginComputePass({
      label: 'compute pass',
    });
    pass.setPipeline(this.#pipeline);
    pass.setBindGroup(0, this.#bindGroup0);
    pass.dispatchWorkgroups(1);
    pass.end();

    // Finish encoding and submit the commands
    const computeCommandBuffer = encoder.finish();
    this.#device.queue.submit([computeCommandBuffer]);
  }
}