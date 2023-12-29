import { BVH } from '$lib/bvh/bvh';
import type { Material } from '$lib/materials/Material';
import type { Triangle } from '$lib/primitives/triangle';
import { computeShader } from '$lib/shaders/computeShader';
import { vec2 } from '$lib/utils/math';
import { getBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';
import type { Matrix4, Vector2, Vector3 } from 'three';

export class ComputeSegment {
  // private fields
  #device: GPUDevice;
  #pipeline: GPUComputePipeline;

  #bindGroup0: GPUBindGroup | null = null;
  #bindGroup1: GPUBindGroup | null = null;
  #bindGroup2: GPUBindGroup | null = null;
  #bindGroup3: GPUBindGroup | null = null;

  #canvasSize: Vector2 | null = null;
  #canvasSizeUniformBuffer: GPUBuffer;
  #cameraUniformBuffer: GPUBuffer;

  #debugBuffer: GPUBuffer;
  #debugPixelTargetBuffer: GPUBuffer;
  #debugReadBuffer: GPUBuffer;

  #trianglesBuffer: GPUBuffer | null = null;
  #materialsBuffer: GPUBuffer | null = null;
  #bvhBuffer: GPUBuffer | null = null;

  constructor(device: GPUDevice) {
    this.#device = device;

    const computeModule = device.createShaderModule({
      label: 'compute module',
      code: computeShader
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [
        getBindGroupLayout(device, [
          { visibility: GPUShaderStage.COMPUTE, type: 'storage' },
          { visibility: GPUShaderStage.COMPUTE, type: 'uniform' }
        ]),
        getBindGroupLayout(device, [{ visibility: GPUShaderStage.COMPUTE, type: 'uniform' }]),
        getBindGroupLayout(device, [
          { visibility: GPUShaderStage.COMPUTE, type: 'storage' },
          { visibility: GPUShaderStage.COMPUTE, type: 'uniform' }
        ]),
        getBindGroupLayout(device, [
          { visibility: GPUShaderStage.COMPUTE, type: 'read-only-storage' },
          { visibility: GPUShaderStage.COMPUTE, type: 'read-only-storage' },
          { visibility: GPUShaderStage.COMPUTE, type: 'read-only-storage' }
        ])
      ]
    });

    this.#pipeline = device.createComputePipeline({
      label: 'compute pipeline',
      layout: pipelineLayout,
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

    // these buffers will be assigned by setDebugPixelTarget
    this.#debugBuffer = device.createBuffer({ size: 0, usage: 1 });
    this.#debugPixelTargetBuffer = device.createBuffer({ size: 0, usage: 1 });
    this.#debugReadBuffer = device.createBuffer({ size: 0, usage: 1 });
    this.setDebugPixelTarget(0, 0);
  }

  setDebugPixelTarget(x: number, y: number) {
    const size = 100;

    this.#debugBuffer = this.#device.createBuffer({
      size: 4 * size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    this.#device.queue.writeBuffer(
      this.#debugBuffer,
      0,
      new Float32Array(Array.from({ length: size }, (_, i) => 0))
    );

    this.#debugPixelTargetBuffer = this.#device.createBuffer({
      size: 4 * 2,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.#device.queue.writeBuffer(this.#debugPixelTargetBuffer, 0, new Uint32Array([x, y]));

    this.#debugReadBuffer = this.#device.createBuffer({
      size: 4 * size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    this.#bindGroup2 = this.#device.createBindGroup({
      label: 'compute bindgroup - debug buffer',
      layout: this.#pipeline.getBindGroupLayout(2),
      entries: [
        { binding: 0, resource: { buffer: this.#debugBuffer } },
        { binding: 1, resource: { buffer: this.#debugPixelTargetBuffer } }
      ]
    });
  }

  async logDebugResult() {
    /* 
      ****** caution ******
      ****** caution ******
      
      if you use this function in a loop of this type:
      function render() {
        computeSegment.compute();
        computeSegment.logDebugResult();
      }

      since this function is async, it's possible that a mapping will be already pending
      when executing the next render call. In that case webGPU errors out
      For now, I'm only using logDebugResult on demand, when e.g. pressing a key
    */
    await this.#debugReadBuffer.mapAsync(GPUMapMode.READ);
    const f32 = new Float32Array(this.#debugReadBuffer.getMappedRange());
    console.log(f32);
    this.#debugReadBuffer.unmap();
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

  updateScene(triangles: Triangle[], materials: Material[]) {
    const bvh = new BVH(triangles);
    let { 
      trianglesBufferData, trianglesBufferDataByteSize, 
      BVHBufferData, BVHBufferDataByteSize 
    } = bvh.getBufferData();

    let materialsData = new Float32Array(materials.map((mat) => mat.getFloatsArray()).flat());

    this.#trianglesBuffer = this.#device.createBuffer({
      size: trianglesBufferDataByteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.#materialsBuffer = this.#device.createBuffer({
      size: materialsData.byteLength /* determined with offset computer */,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.#bvhBuffer = this.#device.createBuffer({
      size: BVHBufferDataByteSize /* determined with offset computer */,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.#device.queue.writeBuffer(this.#trianglesBuffer, 0, trianglesBufferData);
    this.#device.queue.writeBuffer(this.#materialsBuffer, 0, materialsData);
    this.#device.queue.writeBuffer(this.#bvhBuffer, 0, BVHBufferData);

    // we need to re-create the bindgroup
    this.#bindGroup3 = this.#device.createBindGroup({
      label: 'compute bindgroup - scene data',
      layout: this.#pipeline.getBindGroupLayout(3),
      entries: [
        { binding: 0, resource: { buffer: this.#trianglesBuffer } },
        { binding: 1, resource: { buffer: this.#materialsBuffer } },
        { binding: 2, resource: { buffer: this.#bvhBuffer } }
      ]
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
    if (
      !this.#bindGroup0 ||
      !this.#bindGroup1 ||
      !this.#bindGroup2 ||
      !this.#bindGroup3 ||
      !this.#canvasSize
    ) {
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
    pass.setBindGroup(2, this.#bindGroup2);
    pass.setBindGroup(3, this.#bindGroup3);
    pass.dispatchWorkgroups(workGroupsCount.x, workGroupsCount.y);
    pass.end();

    encoder.copyBufferToBuffer(
      this.#debugBuffer,
      0,
      this.#debugReadBuffer,
      0,
      this.#debugBuffer.size
    );

    // Finish encoding and submit the commands
    const computeCommandBuffer = encoder.finish();
    this.#device.queue.submit([computeCommandBuffer]);
  }
}
