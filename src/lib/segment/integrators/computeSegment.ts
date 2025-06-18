import { getComputeShader } from '$lib/shaders/integrators/Simple-path-race/computeShader';
import { Vector2 } from 'three';
import { centralStatusMessage, samplesInfo } from '../../../routes/stores/main';
import { ResetSegment } from './../resetSegment';
import { TileSequence, type Tile } from '$lib/tile';
import { ComputePassPerformance } from '$lib/webgpu-utils/passPerformance';
import { SAMPLER_TYPE, SPTConfigManager } from '$lib/config';
import { globals } from '$lib/C2';
import { getComputeBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';
import { HaltonSampler } from '$lib/samplers/Halton';
import { UniformSampler } from '$lib/samplers/Uniform';
import { BlueNoiseSampler } from '$lib/samplers/BlueNoise';
import { CustomR2Sampler } from '$lib/samplers/CustomR2';
import type { SceneDataManager } from '$lib/sceneManager';

export class ComputeSegment {
  public passPerformance: ComputePassPerformance;

  // private fields
  private device: GPUDevice;
  private pipeline: GPUComputePipeline | null = null;
  private bindGroupLayouts: GPUBindGroupLayout[];
  private layout: GPUPipelineLayout;
  private configManager = new SPTConfigManager();

  private bindGroup0: GPUBindGroup | null = null;
  private bindGroup1: GPUBindGroup | null = null;
  private bindGroup2: GPUBindGroup | null = null;
  private bindGroup3: GPUBindGroup | null = null;

  private canvasSize: Vector2 | null = null;
  private canvasSizeUniformBuffer: GPUBuffer;
  private randomsUniformBuffer: GPUBuffer;
  private RANDOMS_BUFFER_COUNT = 200;

  private configUniformBuffer: GPUBuffer;
  private tileUniformBuffer: GPUBuffer;

  private debugBufferSize: number;
  private debugBuffer: GPUBuffer;
  private debugPixelTargetBuffer: GPUBuffer;
  private debugReadBuffer: GPUBuffer;

  private resetSegment: ResetSegment;

  private requestShaderCompilation = false;

  private sceneDataManager: SceneDataManager | undefined;

  private haltonSampler = new HaltonSampler();
  private uniformSampler = new UniformSampler();
  private blueNoiseSampler = new BlueNoiseSampler();
  private customR2Sampler = new CustomR2Sampler();

  private tileSequence = new TileSequence({
    avgPerfToIncrease: 25,
    avgPerfToDecrease: 100,
    changeTileSizeOnNewLineOnly: false,
    performanceHistoryCount: 2
  });

  constructor() {
    let device = globals.device;
    this.device = device;

    this.resetSegment = new ResetSegment(device);

    this.passPerformance = new ComputePassPerformance(device);

    this.bindGroupLayouts = [
      getComputeBindGroupLayout(device, ['storage', 'storage', 'uniform']),
      getComputeBindGroupLayout(device, ['uniform', 'uniform', 'uniform', 'uniform']),
      getComputeBindGroupLayout(device, ['storage', 'uniform']),
      getComputeBindGroupLayout(device, [
        'read-only-storage',
        'read-only-storage',
        'read-only-storage',
        'read-only-storage',
        'read-only-storage',
        'uniform',
        'texture',
        'uniform',
        '2d-array',
        '2d-array',
        '2d-array',
        '3d',
        'texture'
      ])
    ];
    this.layout = device.createPipelineLayout({
      bindGroupLayouts: this.bindGroupLayouts
    });

    // create a typedarray to hold the values for the uniforms in JavaScript
    this.canvasSizeUniformBuffer = device.createBuffer({
      label: 'canvas size uniform cs',
      size: 2 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // create a typedarray to hold the values for the uniforms in JavaScript
    this.randomsUniformBuffer = device.createBuffer({
      label: 'randoms uniform cs',
      size: this.RANDOMS_BUFFER_COUNT * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.configUniformBuffer = device.createBuffer({
      label: 'config uniform cs',
      size: this.configManager.bufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.tileUniformBuffer = device.createBuffer({
      label: 'tile uniform cs',
      size: 4 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.debugBufferSize = 100;
    this.debugBuffer = this.device.createBuffer({
      label: 'debug cs',
      size: 4 * this.debugBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    this.debugPixelTargetBuffer = this.device.createBuffer({
      label: 'debug pixel target cs',
      size: 4 * 2,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.debugReadBuffer = this.device.createBuffer({
      label: 'debug red cs',
      size: 4 * this.debugBufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });
    this.setDebugPixelTarget(0, 0);

    this.configManager.e.addEventListener('config-update', this.updateConfig);
    // initial config set
    this.updateConfig();

    this.requestShaderCompilation = true;

    this.tileSequence.e.addEventListener('on-tile-start', this.onTileStart);
    this.tileSequence.e.addEventListener('on-tile-size-increased', this.onTileSizeChanged);
    this.tileSequence.e.addEventListener('on-tile-size-decreased', this.onTileSizeChanged);
  }

  setDebugPixelTarget(x: number, y: number) {
    this.device.queue.writeBuffer(this.debugPixelTargetBuffer, 0, new Uint32Array([x, y]));

    this.device.queue.writeBuffer(
      this.debugBuffer,
      0,
      new Float32Array(Array.from({ length: this.debugBufferSize }, (_, i) => 0))
    );

    this.bindGroup2 = this.device.createBindGroup({
      label: 'compute bindgroup - debug buffer',
      layout: this.bindGroupLayouts[2],
      entries: [
        { binding: 0, resource: { buffer: this.debugBuffer } },
        { binding: 1, resource: { buffer: this.debugPixelTargetBuffer } }
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
    await this.debugReadBuffer.mapAsync(GPUMapMode.READ);
    const f32 = new Float32Array(this.debugReadBuffer.getMappedRange());
    console.log(f32);
    this.debugReadBuffer.unmap();
  }

  onUpdateCamera = () => {
    this.resetSamplesAndTile();
  };

  // arrow function to avoid this. binding for event listeners
  updateConfig = () => {
    this.resetSamplesAndTile();

    this.device.queue.writeBuffer(
      this.configUniformBuffer,
      0,
      this.configManager.getOptionsBuffer()
    );
  };

  updateTile(tile: Tile) {
    this.device.queue.writeBuffer(
      this.tileUniformBuffer,
      0,
      new Uint32Array([tile.x, tile.y, tile.w, tile.h])
    );
  }

  setSceneDataManager(sceneDataManager: SceneDataManager) {
    this.sceneDataManager = sceneDataManager;
    this.sceneDataManager.e.addEventListener('on-scene-update', this.updateScene);
  }

  updateScene = () => {
    if (!this.sceneDataManager) return;

    this.resetSamplesAndTile();

    // if we have a new envmap, we might have to require a shader re-compilation
    this.requestShaderCompilation = true;

    let camera = this.sceneDataManager.camera;
    camera.e.addEventListener('change', this.onUpdateCamera);
    this.onUpdateCamera();

    this.bindGroup1 = this.device.createBindGroup({
      label: 'compute bindgroup - camera struct',
      layout: this.bindGroupLayouts[1],
      entries: [
        { binding: 0, resource: { buffer: camera.cameraUniformBuffer } },
        { binding: 1, resource: { buffer: this.randomsUniformBuffer } },
        { binding: 2, resource: { buffer: this.configUniformBuffer } },
        { binding: 3, resource: { buffer: this.tileUniformBuffer } }
      ]
    });

    let {
      trianglesBuffer,
      materialsBuffer,
      bvhBuffer,
      lightsCDFBuffer,
      envmapPC2DArrayBuffer,
      envmapPC2DBuffer,
      envmapTexture,
      envmapInfoBuffer,
      textureArraySegment
    } = this.sceneDataManager;

    // we need to re-create the bindgroup
    this.bindGroup3 = this.device.createBindGroup({
      label: 'compute bindgroup - scene data',
      layout: this.bindGroupLayouts[3],
      entries: [
        { binding: 0, resource: { buffer: trianglesBuffer! } },
        { binding: 1, resource: { buffer: materialsBuffer! } },
        { binding: 2, resource: { buffer: bvhBuffer! } },
        { binding: 3, resource: { buffer: lightsCDFBuffer! } },
        { binding: 4, resource: { buffer: envmapPC2DArrayBuffer } },
        { binding: 5, resource: { buffer: envmapPC2DBuffer! } },
        { binding: 6, resource: envmapTexture.createView() },
        { binding: 7, resource: { buffer: envmapInfoBuffer } },
        {
          binding: 8,
          resource: textureArraySegment.textures128.createView({ dimension: '2d-array' })
        },
        {
          binding: 9,
          resource: textureArraySegment.textures512.createView({ dimension: '2d-array' })
        },
        {
          binding: 10,
          resource: textureArraySegment.textures1024.createView({ dimension: '2d-array' })
        },
        {
          binding: 11,
          resource: globals.common.lutManager.getTexture().createView({ dimension: '3d' })
        },
        {
          binding: 12,
          resource: globals.common.blueNoiseTexture.createView()
        }
      ]
    });
  };

  resize(canvasSize: Vector2, workBuffer: GPUBuffer, samplesCountBuffer: GPUBuffer) {
    this.resetSegment.resize(canvasSize, workBuffer, samplesCountBuffer);
    this.tileSequence.setCanvasSize(canvasSize);

    this.resetSamplesAndTile();

    this.canvasSize = canvasSize;

    this.device.queue.writeBuffer(
      this.canvasSizeUniformBuffer,
      0,
      new Uint32Array([canvasSize.x, canvasSize.y])
    );

    // we need to re-create the bindgroup since workBuffer
    // is a new buffer
    this.bindGroup0 = this.device.createBindGroup({
      label: 'compute bindgroup',
      layout: this.bindGroupLayouts[0],
      entries: [
        { binding: 0, resource: { buffer: workBuffer } },
        { binding: 1, resource: { buffer: samplesCountBuffer } },
        { binding: 2, resource: { buffer: this.canvasSizeUniformBuffer } }
      ]
    });
  }

  resetSamplesAndTile() {
    this.tileSequence.resetTile();
    samplesInfo.reset();
  }

  updateRandomsBuffer() {
    if (this.configManager.options.SimplePathTrace.SAMPLER_TYPE == SAMPLER_TYPE.HALTON) {
      let arr = new Float32Array(this.haltonSampler.getSamples(this.RANDOMS_BUFFER_COUNT));
      this.device.queue.writeBuffer(this.randomsUniformBuffer, 0, arr);
    }

    if (this.configManager.options.SimplePathTrace.SAMPLER_TYPE == SAMPLER_TYPE.UNIFORM) {
      let arr = new Float32Array(this.uniformSampler.getSamples(this.RANDOMS_BUFFER_COUNT));
      this.device.queue.writeBuffer(this.randomsUniformBuffer, 0, arr);
    }

    if (this.configManager.options.SimplePathTrace.SAMPLER_TYPE == SAMPLER_TYPE.BLUE_NOISE) {
      let arr = new Float32Array(this.blueNoiseSampler.getSamples(this.RANDOMS_BUFFER_COUNT));
      this.device.queue.writeBuffer(this.randomsUniformBuffer, 0, arr);
    }

    if (this.configManager.options.SimplePathTrace.SAMPLER_TYPE == SAMPLER_TYPE.CUSTOM_R2) {
      let arr = new Float32Array(this.customR2Sampler.getSamples(this.RANDOMS_BUFFER_COUNT));
      this.device.queue.writeBuffer(this.randomsUniformBuffer, 0, arr);
    }
  }

  async createPipeline() {
    centralStatusMessage.set('compiling shaders');

    const computeModule = this.device.createShaderModule({
      label: 'compute module',
      code: getComputeShader(globals.common.lutManager, this.configManager)
    });

    this.pipeline = await this.device.createComputePipelineAsync({
      label: 'compute pipeline',
      layout: this.layout,
      compute: {
        module: computeModule,
        entryPoint: 'compute'
      }
    });

    centralStatusMessage.set('');
  }

  saveTilePerformance(tileSeq: TileSequence, simplified: number) {
    if (!tileSeq.isTilePerformanceMeasureable()) return;

    tileSeq.saveComputationPerformance(simplified);
    samplesInfo.setPerformance(simplified);

    // this.passPerformance
    //   .getDeltaInMilliseconds()
    //   .then((delta) => {
    //     if (!this.tileSequence.isTilePerformanceMeasureable()) return;
    //     this.tileSequence.saveComputationPerformance(delta);
    //     samplesInfo.setPerformance(delta);
    //   })
    //   .catch(() => {});
  }

  onTileSizeChanged = () => {
    // when we decrease/increase the tile size, the position doesn't change
    // (since we wont start on new line only like in ReSTIR-PT)
    // thus we'll re-draw a portion of the pixels that were part of the previous tile,
    // those pixels will need a new camera sample to properly accumulate new radiance values
    // otherwise they would count twice the results of the same camera sample
    this.updateRandomsBuffer();
  };

  onTileStart = () => {
    this.updateRandomsBuffer();
    samplesInfo.increment();
  };

  async compute() {
    if (this.requestShaderCompilation) {
      await this.createPipeline();
      this.requestShaderCompilation = false;
    }

    if (
      !this.pipeline ||
      !this.bindGroup0 ||
      !this.bindGroup1 ||
      !this.bindGroup2 ||
      !this.bindGroup3 ||
      !this.canvasSize
    ) {
      throw new Error('undefined bind groups / pipeline / canvasSize');
    }

    if (this.canvasSize.x === 0 || this.canvasSize.y === 0)
      throw new Error('canvas size dimensions is 0');

    if (samplesInfo.count === 0) {
      this.tileSequence.resetTile();
      this.resetSegment.reset();
      this.haltonSampler.reset();
      this.blueNoiseSampler.reset();
      this.uniformSampler.reset();
    }

    let tile = this.tileSequence.getNextTile();
    this.updateTile(tile);

    // work group size in the shader is set to 8,8
    const workGroupsCount = this.tileSequence.getWorkGroupCount();

    // Encode commands to do the computation
    const encoder = this.device.createCommandEncoder({
      label: 'compute encoder'
    });
    const passDescriptor = {
      label: 'compute pass'
    };
    this.passPerformance.updateComputePassDescriptor(passDescriptor);
    const pass = encoder.beginComputePass(passDescriptor);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup0);
    pass.setBindGroup(1, this.bindGroup1);
    pass.setBindGroup(2, this.bindGroup2);
    pass.setBindGroup(3, this.bindGroup3);
    pass.dispatchWorkgroups(workGroupsCount.x, workGroupsCount.y);
    pass.end();

    if (this.tileSequence.isTilePerformanceMeasureable()) {
      this.passPerformance.resolve(encoder);
    }

    encoder.copyBufferToBuffer(this.debugBuffer, 0, this.debugReadBuffer, 0, this.debugBuffer.size);

    let startTime = performance.now();

    // Finish encoding and submit the commands
    const computeCommandBuffer = encoder.finish();
    this.device.queue.submit([computeCommandBuffer]);
    await this.device.queue.onSubmittedWorkDone();

    let endTime = performance.now();
    this.saveTilePerformance(this.tileSequence, endTime - startTime);
  }

  dispose() {
    this.resetSegment.dispose();

    this.canvasSizeUniformBuffer.destroy();
    this.randomsUniformBuffer.destroy();
    this.configUniformBuffer.destroy();
    this.tileUniformBuffer.destroy();
    this.debugBuffer.destroy();
    this.debugPixelTargetBuffer.destroy();
    this.debugReadBuffer.destroy();

    this.configManager.e.removeEventListener('config-update', this.updateConfig);
    this.sceneDataManager?.camera.e.removeEventListener('change', this.onUpdateCamera);
    this.sceneDataManager?.e.removeEventListener('on-scene-update', this.updateScene);
    this.tileSequence.e.removeEventListener('on-tile-start', this.onTileStart);
    this.tileSequence.e.removeEventListener('on-tile-size-increased', this.onTileSizeChanged);
    this.tileSequence.e.removeEventListener('on-tile-size-decreased', this.onTileSizeChanged);
  }
}
