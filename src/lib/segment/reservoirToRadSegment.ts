import { globals } from '$lib/C2';
import { reservoirToRadShader } from '$lib/shaders/reservoirToRadShader';
import { getComputeBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';
import { Vector2 } from 'three';

export class ReservoirToRadianceSegment {
  private device: GPUDevice;
  private pipeline: GPUComputePipeline;

  private bindGroup0: GPUBindGroup | null = null;

  constructor() {
    let device = globals.device;
    this.device = device;

    const module = device.createShaderModule({
      label: 'reservoir to radiance shader',
      code: reservoirToRadShader
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [
        getComputeBindGroupLayout(device, [
          'read-only-storage',
          'storage',
          'storage',
          'storage',
          'uniform'
        ])
      ]
    });

    this.pipeline = device.createComputePipeline({
      label: 'reservoir to radiance pipeline',
      layout: pipelineLayout,
      compute: {
        module,
        entryPoint: 'compute'
      }
    });
  }

  setBuffers(
    reservoirBuffer1: GPUBuffer,
    reservoirBuffer2: GPUBuffer,
    radianceBuffer: GPUBuffer,
    samplesCountBuffer: GPUBuffer,
    canvasSizeBuffer: GPUBuffer
  ) {
    // we need to re-create the bindgroup since workBuffer
    // is a new buffer
    this.bindGroup0 = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: reservoirBuffer1, size: reservoirBuffer1.size } },
        { binding: 1, resource: { buffer: reservoirBuffer2, size: reservoirBuffer2.size } },
        { binding: 2, resource: { buffer: samplesCountBuffer, size: samplesCountBuffer.size } },
        { binding: 3, resource: { buffer: radianceBuffer, size: radianceBuffer.size } },
        { binding: 4, resource: { buffer: canvasSizeBuffer } }
      ]
    });
  }

  addPass(encoder: GPUCommandEncoder, canvasSize: Vector2) {
    if (!this.bindGroup0) {
      throw new Error('undefined render bind group');
    }

    // work group size in the shader is set to 8,8
    const workGroupsCount = new Vector2(Math.ceil(canvasSize.x / 8), Math.ceil(canvasSize.y / 8));

    const passDescriptor = {
      label: 'reservoir to radiance pass'
    };

    const pass = encoder.beginComputePass(passDescriptor);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup0);
    pass.dispatchWorkgroups(workGroupsCount.x, workGroupsCount.y);
    pass.end();
  }
}
