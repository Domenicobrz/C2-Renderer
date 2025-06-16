import { Vector2 } from 'three';
import {
  centralErrorStatusMessage,
  centralStatusMessage,
  samplesInfo
} from '../../../routes/stores/main';
import { ResetSegment } from '../resetSegment';
import { ComputePassPerformance } from '$lib/webgpu-utils/passPerformance';
import { ReSTIR_SAMPLER_TYPE, ReSTIRConfigManager } from '$lib/config';
import { globals } from '$lib/C2';
import { getComputeBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';
import { HaltonSampler } from '$lib/samplers/Halton';
import { UniformSampler } from '$lib/samplers/Uniform';
import { BlueNoiseSampler } from '$lib/samplers/BlueNoise';
import { ReservoirToRadianceSegment } from '../reservoirToRadSegment';
import { getReSTIRPTShader } from '$lib/shaders/integrators/ReSTIR-PT/ReSTIRPTShader';
import { TileSequence, type Tile } from '$lib/tile';
import type { SceneDataManager } from '$lib/sceneManager';

export class ReSTIRPTSegment {
  public passPerformance: ComputePassPerformance;

  // private fields
  private device: GPUDevice;
  private pipeline: GPUComputePipeline | null = null;
  private bindGroupLayouts: GPUBindGroupLayout[];
  private layout: GPUPipelineLayout;
  private configManager = new ReSTIRConfigManager();

  private reservoirToRadSegment = new ReservoirToRadianceSegment();

  private bindGroup0: GPUBindGroup[] = [];
  private bindGroup1: GPUBindGroup | null = null;
  private bindGroup2: GPUBindGroup | null = null;
  private bindGroup3: GPUBindGroup | null = null;

  private SPATIAL_REUSE_PASSES = 3; // 3, as recommended in the paper / DQLin's repo

  private canvasSize: Vector2 | null = null;
  private canvasSizeUniformBuffer: GPUBuffer;

  private passInfoUniformBuffer: GPUBuffer;

  private sequenceUniformBuffer: GPUBuffer;
  private restirRandomsUniformBuffer: GPUBuffer;
  private tileUniformBuffer: GPUBuffer;
  private RANDOMS_BUFFER_COUNT = 200;
  private RESERVOIR_SIZE = 128;
  private restirPassInputMBcount = 0;

  private configUniformBuffer: GPUBuffer;

  private debugBufferSize: number;
  private debugBuffer: GPUBuffer;
  private debugPixelTargetBuffer: GPUBuffer;
  private debugReadBuffer: GPUBuffer;

  private restirPassBuffer1!: GPUBuffer;
  private restirPassBuffer2!: GPUBuffer;
  private workBuffer!: GPUBuffer;
  private samplesCountBuffer!: GPUBuffer;

  private resetSegment: ResetSegment;
  private requestedReset: boolean = false;

  private requestShaderCompilation = false;

  private sceneDataManager: SceneDataManager | undefined;

  private haltonSampler = new HaltonSampler();
  private uniformSampler = new UniformSampler();
  private srUniformSampler = new UniformSampler('seed-string-7'); // was -2
  private uniformSampler2 = new UniformSampler('seed-string-8'); // was -3
  private blueNoiseSampler = new BlueNoiseSampler();

  private computeTile = new TileSequence({
    avgPerfToDecrease: 80,
    avgPerfToIncrease: 120,
    changeTileSizeOnNewLineOnly: true,
    performanceHistoryCount: 3
  });
  private spatialResampleTile = new TileSequence({
    avgPerfToDecrease: 80,
    avgPerfToIncrease: 120,
    changeTileSizeOnNewLineOnly: true,
    performanceHistoryCount: 3
  });

  private renderState: {
    state: 'compute-start' | 'compute' | 'sr' | 'sr-start';
    srIndex: number;
    icIndex: number;
  } = {
    state: 'compute-start',
    srIndex: -1,
    icIndex: 0
  };

  constructor() {
    let device = globals.device;
    this.device = device;

    this.resetSegment = new ResetSegment(device);

    this.passPerformance = new ComputePassPerformance(device);

    this.bindGroupLayouts = [
      getComputeBindGroupLayout(device, ['storage', 'storage', 'uniform']),
      getComputeBindGroupLayout(device, [
        'uniform',
        'uniform',
        'uniform',
        'uniform',
        'uniform',
        'uniform'
      ]),
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
      label: 'ReSTIR pipeline layout',
      bindGroupLayouts: this.bindGroupLayouts
    });

    // create a typedarray to hold the values for the uniforms in JavaScript
    this.canvasSizeUniformBuffer = device.createBuffer({
      label: 'canvas size uniform restirPT',
      size: 2 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.tileUniformBuffer = device.createBuffer({
      label: 'tile uniform restirPT',
      size: 4 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // create a typedarray to hold the values for the uniforms in JavaScript
    this.sequenceUniformBuffer = device.createBuffer({
      label: 'sequence uniform restirPT',
      size: this.RANDOMS_BUFFER_COUNT * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.restirRandomsUniformBuffer = device.createBuffer({
      label: 'restir randoms uniform restirPT',
      size: this.RANDOMS_BUFFER_COUNT * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.passInfoUniformBuffer = device.createBuffer({
      label: 'pass info uniform restirPT',
      size: 4 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.configUniformBuffer = device.createBuffer({
      label: 'config uniform restirPT',
      size: this.configManager.bufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.debugBufferSize = 100;
    this.debugBuffer = this.device.createBuffer({
      label: 'debug restirPT',
      size: 4 * this.debugBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    this.debugPixelTargetBuffer = this.device.createBuffer({
      label: 'debug pixel target restirPT',
      size: 4 * 2,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.debugReadBuffer = this.device.createBuffer({
      label: 'debug read restirPT',
      size: 4 * this.debugBufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });
    this.setDebugPixelTarget(0, 0);

    this.configManager.e.addEventListener('config-update', this.updateConfig);
    this.updateConfig();

    this.requestShaderCompilation = true;
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
    this.debugReadBuffer.unmap();
  }

  onUpdateCamera = () => {
    this.requestReset();
  };

  updateConfig = () => {
    this.requestReset();

    this.device.queue.writeBuffer(
      this.configUniformBuffer,
      0,
      this.configManager.getOptionsBuffer()
    );

    if (this.SPATIAL_REUSE_PASSES != this.configManager.options.ReSTIR.RESTIR_SR_PASS_COUNT) {
      this.SPATIAL_REUSE_PASSES = this.configManager.options.ReSTIR.RESTIR_SR_PASS_COUNT;
      this.updateBindGroup0();
    }

    if (
      this.configManager.options.ReSTIR.GBH_VARIANT !=
      this.configManager.prevOptions.ReSTIR.GBH_VARIANT
    ) {
      this.requestShaderCompilation = true;
    }
  };

  updateScene(sceneDataManager: SceneDataManager) {
    this.requestReset();

    // if we have a new envmap, we might have to require a shader re-compilation
    this.requestShaderCompilation = true;
    this.sceneDataManager = sceneDataManager;

    let camera = sceneDataManager.camera;
    camera.e.addEventListener('change', this.onUpdateCamera);
    this.onUpdateCamera();

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

    this.createBindGroup1();
  }

  updatePassInfoBuffer() {
    const isFinalPass = this.renderState.srIndex == this.SPATIAL_REUSE_PASSES - 1;

    let passIdx = this.renderState.srIndex + 1;
    if (this.renderState.state == 'compute' || this.renderState.state == 'compute-start') {
      passIdx = 0;
    }

    this.device.queue.writeBuffer(
      this.passInfoUniformBuffer,
      0,
      new Uint32Array([isFinalPass ? 1 : 0, this.renderState.icIndex, passIdx, samplesInfo.count])
    );
  }

  createBindGroup1() {
    if (!this.sceneDataManager) return;

    this.bindGroup1 = this.device.createBindGroup({
      label: 'compute bindgroup - camera struct',
      layout: this.bindGroupLayouts[1],
      entries: [
        { binding: 0, resource: { buffer: this.sceneDataManager.camera.cameraUniformBuffer } },
        { binding: 1, resource: { buffer: this.sequenceUniformBuffer } },
        { binding: 2, resource: { buffer: this.restirRandomsUniformBuffer } },
        { binding: 3, resource: { buffer: this.configUniformBuffer } },
        { binding: 4, resource: { buffer: this.passInfoUniformBuffer } },
        { binding: 5, resource: { buffer: this.tileUniformBuffer } }
      ]
    });
  }

  resetRestirPassData() {
    const byteSize = this.canvasSize!.x * this.canvasSize!.y * this.RESERVOIR_SIZE;
    const restirPassInput = new Uint8Array(byteSize);
    this.device.queue.writeBuffer(this.restirPassBuffer1, 0, restirPassInput);
    this.device.queue.writeBuffer(this.restirPassBuffer2, 0, restirPassInput);
  }

  resize(canvasSize: Vector2, workBuffer: GPUBuffer, samplesCountBuffer: GPUBuffer) {
    this.workBuffer = workBuffer;
    this.samplesCountBuffer = samplesCountBuffer;
    this.resetSegment.resize(canvasSize, workBuffer, samplesCountBuffer);

    this.computeTile.setCanvasSize(canvasSize);
    this.spatialResampleTile.setCanvasSize(canvasSize);

    this.canvasSize = canvasSize;

    this.device.queue.writeBuffer(
      this.canvasSizeUniformBuffer,
      0,
      new Uint32Array([canvasSize.x, canvasSize.y])
    );

    const restirPassInputByteLength = canvasSize.x * canvasSize.y * this.RESERVOIR_SIZE;
    this.restirPassInputMBcount = restirPassInputByteLength / (1024 * 1024);

    if (restirPassInputByteLength > globals.adapter.limits.maxStorageBufferBindingSize) {
      centralErrorStatusMessage.set(
        'Error: ReSTIR buffer size exceeds maximum storage buffer byte allocation for your GPU - Lower the resolution of your canvas'
      );
    }

    if (this.restirPassBuffer1) this.restirPassBuffer1.destroy();
    if (this.restirPassBuffer2) this.restirPassBuffer2.destroy();
    this.restirPassBuffer1 = this.device.createBuffer({
      label: 'restir pass data 1',
      size: restirPassInputByteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    this.restirPassBuffer2 = this.device.createBuffer({
      label: 'restir pass data 2',
      size: restirPassInputByteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.updateBindGroup0();

    this.requestReset();
  }

  updateBindGroup0() {
    // since we're calling updateConfig() in the constructor, it'll also trigger this call,
    // reason why we have to make the existence check... we need to refactor this logic
    if (!this.restirPassBuffer1) return;

    this.bindGroup0 = [];
    this.bindGroup0.push(
      this.device.createBindGroup({
        label: 'compute bindgroup',
        layout: this.bindGroupLayouts[0],
        entries: [
          // ************* important note ****************
          // it's not necessary to use anything else other than this.restirPassBuffer1 here because
          // even if the final result is saved in restirPassBuffer2, reservoirToRadSegment will copy
          // the result into restirPassBuffer1 before we start the next iteration
          { binding: 0, resource: { buffer: this.restirPassBuffer1 } },
          { binding: 1, resource: { buffer: this.restirPassBuffer2 } },
          { binding: 2, resource: { buffer: this.canvasSizeUniformBuffer } }
        ]
      })
    );

    for (let i = 0; i < this.SPATIAL_REUSE_PASSES; i++) {
      // we need to re-create the bindgroup since workBuffer
      // is a new buffer
      this.bindGroup0.push(
        this.device.createBindGroup({
          label: 'spatial reuse bindgroup 0',
          layout: this.bindGroupLayouts[0],
          entries: [
            {
              binding: 0,
              resource: { buffer: i % 2 == 0 ? this.restirPassBuffer1 : this.restirPassBuffer2 }
            },
            {
              binding: 1,
              resource: { buffer: i % 2 == 0 ? this.restirPassBuffer2 : this.restirPassBuffer1 }
            },
            { binding: 2, resource: { buffer: this.canvasSizeUniformBuffer } }
          ]
        })
      );
    }
  }

  requestReset() {
    this.requestedReset = true;
    // this line is necessary since if we've already reached the
    // samples limit, without resetting the samples to 0
    // the compute() function wouldn't run and thus wouldn't
    // reset our buffers
    samplesInfo.reset();
  }

  // This method will be called after the first onCanvasResize() call is made
  // inside switchIntegrator(...) in C2.ts
  resetSamplesAndTile() {
    this.requestedReset = false;

    this.computeTile.resetTile(new Vector2(64, 64));
    this.spatialResampleTile.resetTile(new Vector2(64, 64));
    this.renderState = { state: 'compute-start', srIndex: 0, icIndex: 0 };
    this.updatePassInfoBuffer();

    this.resetRestirPassData();
    this.resetSegment.reset();

    this.haltonSampler.reset();
    this.blueNoiseSampler.reset();
    this.uniformSampler.reset();
    this.srUniformSampler.reset();
  }

  updateReSTIRRandoms() {
    // ReSTIR random numbers, which have to be different from path-tracing random numbers
    if (this.renderState.state == 'sr' || this.renderState.state == 'sr-start') {
      let samplerType = this.configManager.options.ReSTIR.SAMPLER_TYPE;

      if (samplerType == ReSTIR_SAMPLER_TYPE.UNIFORM) {
        let rarr = new Float32Array(this.uniformSampler2.getSamples(this.RANDOMS_BUFFER_COUNT));
        this.device.queue.writeBuffer(this.restirRandomsUniformBuffer, 0, rarr);
      }

      if (samplerType == ReSTIR_SAMPLER_TYPE.BLUE_NOISE) {
        let rarr = new Float32Array(this.blueNoiseSampler.getSamples(this.RANDOMS_BUFFER_COUNT));
        this.device.queue.writeBuffer(this.restirRandomsUniformBuffer, 0, rarr);
      }

      if (samplerType == ReSTIR_SAMPLER_TYPE.HALTON_2_THEN_UNIFORM) {
        let haltonArr = this.haltonSampler.getSamples(2);
        let uniformArr = this.uniformSampler2.getSamples(this.RANDOMS_BUFFER_COUNT - 2);
        this.device.queue.writeBuffer(
          this.restirRandomsUniformBuffer,
          0,
          new Float32Array([...haltonArr, ...uniformArr])
        );
      }
    } else {
      // for initial-candidates reservoirs we'll just use standard uniform random numbers
      let rarr = new Float32Array(this.uniformSampler2.getSamples(this.RANDOMS_BUFFER_COUNT));
      this.device.queue.writeBuffer(this.restirRandomsUniformBuffer, 0, rarr);
    }
  }

  updateRandomSeed() {
    this.device.queue.writeBuffer(
      this.sequenceUniformBuffer,
      0,
      new Float32Array(this.uniformSampler.getSamples(1))
    );

    this.updateReSTIRRandoms();
  }

  async createPipeline() {
    centralStatusMessage.set('compiling shaders');

    const computeModule = this.device.createShaderModule({
      label: 'ReSTIR PT module',
      code: getReSTIRPTShader(globals.common.lutManager, this.configManager)
    });

    this.pipeline = await this.device.createComputePipelineAsync({
      label: 'ReSTIR PT pipeline',
      layout: this.layout,
      compute: {
        module: computeModule,
        entryPoint: 'compute'
      }
    });

    centralStatusMessage.set('');
  }

  saveTilePerformance(
    tileSeq: TileSequence,
    passPerformance: ComputePassPerformance,
    simplified: number
  ) {
    if (!tileSeq.isTilePerformanceMeasureable()) return;

    tileSeq.saveComputationPerformance(simplified);
    samplesInfo.setPerformance(simplified);

    // passPerformance
    //   .getDeltaInMilliseconds()
    //   .then((delta) => {
    //     tileSeq.saveComputationPerformance(delta);
    //   })
    //   .catch(() => {});
  }

  updateTile(tile: Tile) {
    this.device.queue.writeBuffer(
      this.tileUniformBuffer,
      0,
      new Uint32Array([tile.x, tile.y, tile.w, tile.h])
    );
  }

  async compute() {
    if (this.requestedReset) {
      this.resetSamplesAndTile();
    }

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

    samplesInfo.setReSTIRState({
      state: this.renderState.state,
      srPassIndex: this.renderState.srIndex,
      initialCandidateIndex: this.renderState.icIndex,
      bufferSizeMB: this.restirPassInputMBcount
    });

    if (this.renderState.state == 'compute-start') {
      this.renderState.icIndex = 0;
      this.renderState.srIndex = 0;
      this.renderState.state = 'compute';

      this.updateRandomSeed();
      this.updateReSTIRRandoms();
      this.updatePassInfoBuffer();
    }

    if (this.renderState.state == 'compute') {
      let tile = this.computeTile.getNextTile(() => {});
      this.updateTile(tile);

      // work group size in the shader is set to 8,8
      const workGroupsCount = this.computeTile.getWorkGroupCount();

      // Encode commands to do the computation
      const encoder = this.device.createCommandEncoder({
        label: 'ReSTIR encoder'
      });
      const passDescriptor = {
        label: 'initial pass'
      };
      this.passPerformance.updateComputePassDescriptor(passDescriptor);
      const pass = encoder.beginComputePass(passDescriptor);
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup0[0]);
      pass.setBindGroup(1, this.bindGroup1);
      pass.setBindGroup(2, this.bindGroup2);
      pass.setBindGroup(3, this.bindGroup3);
      pass.dispatchWorkgroups(workGroupsCount.x, workGroupsCount.y);
      pass.end();
      this.passPerformance.resolve(encoder);

      encoder.copyBufferToBuffer(
        this.debugBuffer,
        0,
        this.debugReadBuffer,
        0,
        this.debugBuffer.size
      );

      let startTime = performance.now();

      // Finish encoding and submit the commands
      const computeCommandBuffer = encoder.finish();
      this.device.queue.submit([computeCommandBuffer]);
      await this.device.queue.onSubmittedWorkDone();

      let endTime = performance.now();

      this.saveTilePerformance(this.computeTile, this.passPerformance, endTime - startTime);

      if (this.computeTile.isLastTileBeforeRestart()) {
        let wasLastInitialCandidate =
          this.renderState.icIndex ==
          this.configManager.options.ReSTIR.RESTIR_INITIAL_CANDIDATES - 1;

        if (wasLastInitialCandidate) {
          // move to the spatial-resample pass
          this.renderState.state = 'sr';
          this.renderState.srIndex = 0;
          this.renderState.icIndex = 0;
          this.updateRandomSeed();
          this.updateReSTIRRandoms();
          this.updatePassInfoBuffer();
        } else {
          this.renderState.icIndex++;
          this.updateRandomSeed();
          this.updateReSTIRRandoms();
          this.updatePassInfoBuffer();
        }
      }
    }

    if (this.renderState.state == 'sr') {
      let isLastSRPass = this.renderState.srIndex == this.SPATIAL_REUSE_PASSES - 1;
      let tile = this.spatialResampleTile.getNextTile(() => {});
      let isLastTileBeforeRestart = this.spatialResampleTile.isLastTileBeforeRestart();
      this.updateTile(tile);

      // work group size in the shader is set to 8,8
      const workGroupsCount = this.spatialResampleTile.getWorkGroupCount();

      // Encode commands to do the computation
      const encoder = this.device.createCommandEncoder({
        label: 'ReSTIR encoder'
      });

      const srPassDescriptor = {
        label: `spatial-reuse pass i: ${this.renderState.srIndex}`
      };
      this.passPerformance.updateComputePassDescriptor(srPassDescriptor);
      const srPass = encoder.beginComputePass(srPassDescriptor);
      srPass.setPipeline(this.pipeline);
      srPass.setBindGroup(0, this.bindGroup0[this.renderState.srIndex + 1]);
      srPass.setBindGroup(1, this.bindGroup1);
      srPass.setBindGroup(2, this.bindGroup2);
      srPass.setBindGroup(3, this.bindGroup3);
      srPass.dispatchWorkgroups(workGroupsCount.x, workGroupsCount.y);
      srPass.end();
      this.passPerformance.resolve(encoder);

      if (isLastTileBeforeRestart && isLastSRPass) {
        // this segment also copies the content of one reservoir buffer to the other reservoir buffer
        // this is necessary because the next iteration of RestirPTShader will always use restirPassBuffer1
        this.reservoirToRadSegment.setBuffers(
          this.SPATIAL_REUSE_PASSES % 2 == 0 ? this.restirPassBuffer1 : this.restirPassBuffer2,
          this.SPATIAL_REUSE_PASSES % 2 == 0 ? this.restirPassBuffer2 : this.restirPassBuffer1,
          this.workBuffer,
          this.samplesCountBuffer,
          this.canvasSizeUniformBuffer
        );
        this.reservoirToRadSegment.addPass(encoder, this.canvasSize);
      }

      encoder.copyBufferToBuffer(
        this.debugBuffer,
        0,
        this.debugReadBuffer,
        0,
        this.debugBuffer.size
      );

      let startTime = performance.now();

      // Finish encoding and submit the commands
      const computeCommandBuffer = encoder.finish();
      this.device.queue.submit([computeCommandBuffer]);
      await this.device.queue.onSubmittedWorkDone();

      let endTime = performance.now();

      this.saveTilePerformance(this.spatialResampleTile, this.passPerformance, endTime - startTime);

      if (isLastTileBeforeRestart) {
        // Re-evaluate this condition after the await, just in case a config change occurred
        // for spatial_reuse_passes count or in general to prevent potential race conditions
        // caused by having to await on the this.device.queue.onSumbitted... call
        // const isLastSRPass_reEvaluated = this.renderState.srIndex === this.SPATIAL_REUSE_PASSES - 1;

        // if (isLastSRPass_reEvaluated) {
        if (isLastSRPass) {
          this.renderState.state = 'compute-start';
          samplesInfo.increment();
        } else {
          this.renderState.srIndex++;
          this.updateReSTIRRandoms();
          this.updatePassInfoBuffer();
        }
      }
    }
  }

  dispose() {
    this.resetSegment.dispose();

    this.canvasSizeUniformBuffer.destroy();
    this.passInfoUniformBuffer.destroy();
    this.sequenceUniformBuffer.destroy();
    this.restirRandomsUniformBuffer.destroy();
    this.configUniformBuffer.destroy();
    this.tileUniformBuffer.destroy();
    this.debugBuffer.destroy();
    this.debugPixelTargetBuffer.destroy();
    this.debugReadBuffer.destroy();

    this.restirPassBuffer1.destroy();
    this.restirPassBuffer2.destroy();

    this.configManager.e.removeEventListener('config-update', this.updateConfig);
    this.sceneDataManager?.camera.e.removeEventListener('change', this.onUpdateCamera);

    // these two are external !! they haven't been created here
    // this.workBuffer
    // this.samplesCountBuffer
  }
}
