import { Vector2 } from 'three';
import { globals } from '$lib/C2';
import { multiScatterLUTShader } from '$lib/shaders/multiScatterLUTShader';
import { getComputeBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';
import { saveArrayBufferLocally } from '$lib/utils/saveArrayBufferLocally';

export class MultiScatterLUTSegment {
  // private fields
  private device: GPUDevice;
  private pipeline: GPUComputePipeline | null = null;
  private bindGroupLayouts: GPUBindGroupLayout[];
  private layout: GPUPipelineLayout;

  private randsUniformBuffer: GPUBuffer;
  private workBuffer: GPUBuffer | null = null;
  private stagingBuffer: GPUBuffer | null = null;

  private bindGroup0: GPUBindGroup | null = null;

  private LUTSize: Vector2 = new Vector2(-1, -1);
  private LUTbyteLength: number = -1;

  constructor() {
    let device = globals.device;
    this.device = device;

    this.bindGroupLayouts = [getComputeBindGroupLayout(device, ['storage', 'uniform', 'uniform'])];
    this.layout = device.createPipelineLayout({
      label: 'multi-scatter LUT - pipeline layout',
      bindGroupLayouts: this.bindGroupLayouts
    });

    const computeModule = this.device.createShaderModule({
      label: 'multi-scatter LUT compute module',
      code: multiScatterLUTShader
    });

    this.pipeline = this.device.createComputePipeline({
      label: 'multi-scatter LUT compute pipeline',
      layout: this.layout,
      compute: {
        module: computeModule,
        entryPoint: 'compute'
      }
    });

    this.randsUniformBuffer = this.device.createBuffer({
      label: 'multi-scatter LUT - work buffer',
      size: 4 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
  }

  createImageFromLUT(size: Vector2, data: Float32Array) {
    let width = size.x;
    let height = size.y;
    let buffer = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let bufferIdx = y * width + x;
        // canvas sadly puts the data in flippedY order so we need to use a different index
        let dataIdx = (height - y - 1) * width + x;

        let val = data[dataIdx];
        buffer[bufferIdx * 4 + 0] = val * 255;
        buffer[bufferIdx * 4 + 1] = val * 255;
        buffer[bufferIdx * 4 + 2] = val * 255;
        buffer[bufferIdx * 4 + 3] = 255;
      }
    }

    let canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('missing canvas-2d context');

    canvas.width = width;
    canvas.height = height;

    var idata = ctx.createImageData(width, height);
    idata.data.set(buffer);

    ctx.putImageData(idata, 0, 0);

    var image = new Image();
    image.src = canvas.toDataURL('image/png', 1.0);
    document.body.appendChild(image);
  }

  async readBuffer() {
    if (!this.stagingBuffer || !this.workBuffer)
      throw new Error('msLUT error - staging or work buffer is null');

    const commandEncoder = this.device.createCommandEncoder();
    // in theory, we could have added the command below to the compute
    // commands inside compute(), however we'll iterate a bunch of times
    // before completing the creation of the LUT, thus it's simpler to create a new
    // and simpler command encoder here
    // Copy output buffer to staging buffer.
    commandEncoder.copyBufferToBuffer(
      this.workBuffer,
      0,
      this.stagingBuffer,
      0,
      this.LUTbyteLength
    );
    this.device.queue.submit([commandEncoder.finish()]);

    await this.stagingBuffer.mapAsync(GPUMapMode.READ, 0, this.LUTbyteLength);
    const copyArrayBuffer = this.stagingBuffer.getMappedRange(0, this.LUTbyteLength);
    const data = copyArrayBuffer.slice(0);
    this.stagingBuffer.unmap();
    const floatsData = new Float32Array(data);
    console.log(floatsData);

    this.saveLUTBuffer(floatsData);
  }

  saveLUTBuffer(floatsData: Float32Array) {
    let arrayBuffer = new ArrayBuffer(floatsData.byteLength + 2 * 4);
    let uintView = new Uint32Array(arrayBuffer, 0, 2);
    uintView[0] = this.LUTSize.x;
    uintView[1] = this.LUTSize.y;

    let elsCount = this.LUTSize.x * this.LUTSize.y;
    let floatsView = new Float32Array(arrayBuffer, 2 * 4, elsCount);
    floatsView.set(floatsData, 0);

    saveArrayBufferLocally(arrayBuffer, 'torranceSparrowMultiScatter.LUT');
  }

  setSize(size: Vector2) {
    this.LUTSize = size;

    let LUTSizeUniformBuffer = this.device.createBuffer({
      size: 2 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(
      LUTSizeUniformBuffer,
      0,
      new Uint32Array([this.LUTSize.x, this.LUTSize.y])
    );

    const input = new Float32Array(size.x * size.y);
    this.LUTbyteLength = input.byteLength;
    this.workBuffer = this.device.createBuffer({
      label: 'multi-scatter LUT - work buffer',
      size: this.LUTbyteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    this.device.queue.writeBuffer(this.workBuffer, 0, input);

    this.stagingBuffer = this.device.createBuffer({
      label: 'multi-scatter LUT - staging buffer',
      size: this.LUTbyteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    this.bindGroup0 = this.device.createBindGroup({
      label: 'multi-scatter LUT - compute bindgroup',
      layout: this.bindGroupLayouts[0],
      entries: [
        { binding: 0, resource: { buffer: this.workBuffer } },
        { binding: 1, resource: { buffer: LUTSizeUniformBuffer } },
        { binding: 2, resource: { buffer: this.randsUniformBuffer } }
      ]
    });
  }

  updateRands() {
    this.device.queue.writeBuffer(
      this.randsUniformBuffer,
      0,
      new Float32Array([Math.random(), Math.random(), Math.random(), Math.random()])
    );
  }

  async compute() {
    if (!this.pipeline || !this.bindGroup0 || !this.LUTSize) {
      throw new Error('undefined bind groups / pipeline / canvasSize');
    }

    this.updateRands();

    // work group size in the shader is set to 8,8
    const workGroupsCount = new Vector2(
      Math.ceil(this.LUTSize.x / 8),
      Math.ceil(this.LUTSize.y / 8)
    );

    // Encode commands to do the computation
    const encoder = this.device.createCommandEncoder({
      label: 'multi-scatter lut compute encoder'
    });
    const passDescriptor = {
      label: 'multi-scatter lut compute pass'
    };
    const pass = encoder.beginComputePass(passDescriptor);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup0);
    pass.dispatchWorkgroups(workGroupsCount.x, workGroupsCount.y);
    pass.end();

    // Finish encoding and submit the commands
    const computeCommandBuffer = encoder.finish();
    this.device.queue.submit([computeCommandBuffer]);

    return this.device.queue.onSubmittedWorkDone();
  }
}
