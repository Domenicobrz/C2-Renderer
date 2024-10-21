import { Vector2, Vector3 } from 'three';
import { globals } from '$lib/C2';
import { multiScatterLUTShader } from '$lib/shaders/multiScatterLUTShader';
import { getComputeBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';
import { saveArrayBufferLocally } from '$lib/utils/saveArrayBufferLocally';
import { multiScatterLUTTestShader } from '$lib/shaders/multiScatterLUTTestShader';
import { Eavg, EavgI, ESS, ESSI } from './luttest';

export class MultiScatterLUTTestSegment {
  // private fields
  private device: GPUDevice;
  private pipeline: GPUComputePipeline | null = null;
  private bindGroupLayouts: GPUBindGroupLayout[];
  private layout: GPUPipelineLayout;

  private randsUniformBuffer: GPUBuffer;
  private workBuffer: GPUBuffer | null = null;
  private stagingBuffer: GPUBuffer | null = null;

  private bindGroup0: GPUBindGroup | null = null;

  private LUTSize: Vector3 = new Vector3(-1, -1, -1);
  private LUTbyteLength: number = -1;

  private samplesCount: number = 0;

  constructor() {
    let device = globals.device;
    this.device = device;

    this.bindGroupLayouts = [
      getComputeBindGroupLayout(device, [
        'storage',
        'uniform',
        'uniform',
        '3d',
        'texture',
        '3d',
        'texture'
      ])
    ];
    this.layout = device.createPipelineLayout({
      label: 'multi-scatter LUT - pipeline layout',
      bindGroupLayouts: this.bindGroupLayouts
    });

    const computeModule = this.device.createShaderModule({
      label: 'multi-scatter LUT compute module',
      code: multiScatterLUTTestShader
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
    let floatsData = new Float32Array(data);
    floatsData = floatsData.map((v) => v / this.samplesCount);
    console.log(floatsData);

    // this.saveLUTBuffer(floatsData);
  }

  saveLUTBuffer(floatsData: Float32Array) {
    let headerBytes = 4 * 4;
    let arrayBuffer = new ArrayBuffer(floatsData.byteLength + headerBytes);
    let uintView = new Uint32Array(arrayBuffer, 0, 4);
    uintView[0] = 1; // number of channels (r,g,b,a)
    uintView[1] = this.LUTSize.x;
    uintView[2] = this.LUTSize.y;
    uintView[3] = this.LUTSize.z;

    let elsCount = this.LUTSize.x * this.LUTSize.y * this.LUTSize.z;
    let floatsView = new Float32Array(arrayBuffer, headerBytes, elsCount);
    floatsView.set(floatsData, 0);

    saveArrayBufferLocally(arrayBuffer, 'multiScatter.LUT');
  }

  setSize(size: Vector3, type: number) {
    const lut32texture = this.device.createTexture({
      label: 'ess 3d texture',
      size: [16, 16, 16],
      dimension: '3d', // defaults to 2d so it's best to set it here
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    let lut32data = [];
    for (let i = 0; i < ESS.length; i++) {
      lut32data.push(ESS[i], 0, 0, 0);
    }
    this.device.queue.writeTexture(
      { texture: lut32texture },
      new Float32Array(lut32data),
      { bytesPerRow: 16 * 4 * 4, rowsPerImage: 16 },
      { width: 16, height: 16, depthOrArrayLayers: 16 }
    );

    const eavgtexture = this.device.createTexture({
      label: 'eavg texture',
      size: [16, 16, 1],
      dimension: '2d', // defaults to 2d so it's best to set it here
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    let eavgtexturedata = [];
    for (let i = 0; i < Eavg.length; i++) {
      eavgtexturedata.push(Eavg[i], 0, 0, 0);
    }
    this.device.queue.writeTexture(
      { texture: eavgtexture },
      new Float32Array(eavgtexturedata),
      { bytesPerRow: 16 * 4 * 4, rowsPerImage: 16 },
      { width: 16, height: 16, depthOrArrayLayers: 1 }
    );

    const essitexture = this.device.createTexture({
      label: 'essi 3d texture',
      size: [16, 16, 16],
      dimension: '3d', // defaults to 2d so it's best to set it here
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    let essidata = [];
    for (let i = 0; i < ESSI.length; i++) {
      essidata.push(ESSI[i], 0, 0, 0);
    }
    this.device.queue.writeTexture(
      { texture: essitexture },
      new Float32Array(essidata),
      { bytesPerRow: 16 * 4 * 4, rowsPerImage: 16 },
      { width: 16, height: 16, depthOrArrayLayers: 16 }
    );

    const eavgItexture = this.device.createTexture({
      label: 'eavgI texture',
      size: [16, 16, 1],
      dimension: '2d', // defaults to 2d so it's best to set it here
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    let eavgItexturedata = [];
    for (let i = 0; i < EavgI.length; i++) {
      eavgItexturedata.push(EavgI[i], 0, 0, 0);
    }
    this.device.queue.writeTexture(
      { texture: eavgItexture },
      new Float32Array(eavgItexturedata),
      { bytesPerRow: 16 * 4 * 4, rowsPerImage: 16 },
      { width: 16, height: 16, depthOrArrayLayers: 1 }
    );

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
        {
          binding: 3,
          resource: lut32texture.createView({ dimension: '3d' })
        },
        {
          binding: 4,
          resource: eavgtexture.createView()
        },
        {
          binding: 5,
          resource: essitexture.createView({ dimension: '3d' })
        },
        {
          binding: 6,
          resource: eavgItexture.createView()
        }
      ]
    });
  }

  updateRands() {
    let arr = [Math.random(), Math.random(), Math.random(), Math.random()];
    this.device.queue.writeBuffer(this.randsUniformBuffer, 0, new Float32Array(arr));
  }

  async compute() {
    this.samplesCount += 1;
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
}
