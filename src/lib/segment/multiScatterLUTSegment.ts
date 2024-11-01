import { Vector2, Vector3 } from 'three';
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
  private samples: number = 1;

  private LUTSize: Vector3 = new Vector3(-1, -1, -1);
  private LUTbyteLength: number = -1;

  constructor() {
    let device = globals.device;
    this.device = device;

    this.bindGroupLayouts = [
      getComputeBindGroupLayout(device, ['storage', 'uniform', 'uniform', 'uniform'])
    ];
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
      label: 'multi-scatter LUT - randoms buffer',
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
    const floatsData = new Float32Array(data).map((v) => (v /= this.samples));
    // console.log(floatsData);

    this.saveLUTBuffer(floatsData, 1, this.LUTSize);
  }

  saveLUTBuffer(floatsData: Float32Array, channels: number, lutSize: Vector3) {
    let headerBytes = 4 * 4;
    let arrayBuffer = new ArrayBuffer(floatsData.byteLength + headerBytes);
    let uintView = new Uint32Array(arrayBuffer, 0, 4);
    uintView[0] = channels; // number of channels (r,g,b,a)
    uintView[1] = lutSize.x;
    uintView[2] = lutSize.y;
    uintView[3] = lutSize.z;

    let elsCount = lutSize.x * lutSize.y * lutSize.z;
    let floatsView = new Float32Array(arrayBuffer, headerBytes, elsCount);
    floatsView.set(floatsData, 0);

    saveArrayBufferLocally(arrayBuffer, 'multiScatter.LUT');
  }

  integrateEavg(Eo: Float32Array, size: number, x: number, z: number) {
    let step = 1 / size;
    let int = 0;

    for (let y = 0; y < size; y++) {
      let dotVN = (y + 0.5) / size;

      let idx = z * size * size + y * size + x;

      let v = Eo[idx];
      int += v * /* Math.abs(dotVN) */ dotVN * step;
    }
    int *= 2;

    return int;
  }

  calculateEavg(Eo: Float32Array, size: number) {
    // x: roughness, y: eta
    let Eavg = [];

    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        Eavg.push(this.integrateEavg(Eo, size, j, i));
      }
    }

    console.log(Eavg);
    this.saveLUTBuffer(new Float32Array(Eavg), 1, new Vector3(size, size, 1));
  }

  setSize(size: Vector3, type: number) {
    this.LUTSize = size;

    let LUTTypeUniformBuffer = this.device.createBuffer({
      size: 1 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(LUTTypeUniformBuffer, 0, new Uint32Array([type]));

    let LUTSizeUniformBuffer = this.device.createBuffer({
      size: 3 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(
      LUTSizeUniformBuffer,
      0,
      new Uint32Array([this.LUTSize.x, this.LUTSize.y, this.LUTSize.z])
    );

    const input = new Float32Array(size.x * size.y * size.z);
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
        { binding: 2, resource: { buffer: this.randsUniformBuffer } },
        { binding: 3, resource: { buffer: LUTTypeUniformBuffer } }
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

  async computeLUT() {
    if (!this.pipeline || !this.bindGroup0 || !this.LUTSize) {
      throw new Error('undefined bind groups / pipeline / canvasSize');
    }

    this.updateRands();

    // work group size in the shader is set to 8,8
    const workGroupsCount = new Vector3(
      Math.ceil(this.LUTSize.x / 8),
      Math.ceil(this.LUTSize.y / 8),
      Math.ceil(this.LUTSize.z)
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
    pass.dispatchWorkgroups(workGroupsCount.x, workGroupsCount.y, workGroupsCount.z);
    pass.end();

    // Finish encoding and submit the commands
    const computeCommandBuffer = encoder.finish();
    this.device.queue.submit([computeCommandBuffer]);

    return this.device.queue.onSubmittedWorkDone();
  }

  async compute(samples: number) {
    this.samples = samples;

    if (!this.pipeline || !this.bindGroup0 || !this.LUTSize) {
      throw new Error('undefined bind groups / pipeline / canvasSize');
    }

    for (let i = 0; i < samples; i++) {
      await this.computeLUT();
      console.log('computed sample: ', i);
    }

    return;
  }
}
