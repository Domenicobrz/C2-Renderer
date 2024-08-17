import { BVH } from '$lib/bvh/bvh';
import { getComputeShader } from '$lib/shaders/computeShader';
import { getBindGroupLayout } from '$lib/webgpu-utils/getBindGroupLayout';
import { Matrix4, Vector2, Vector3 } from 'three';
import { configOptions, samplesInfo } from '../../routes/stores/main';
import { ResetSegment } from './resetSegment';
import type { TileSequence, Tile } from '$lib/tile';
import { ComputePassPerformance } from '$lib/webgpu-utils/passPerformance';
import { configManager } from '$lib/config';
import type { C2Scene } from '$lib/createScene';
import { Envmap } from '$lib/envmap/envmap';
import { Camera } from '$lib/controls/Camera';

export class ComputeSegment {
  public passPerformance: ComputePassPerformance;

  // private fields
  #device: GPUDevice;
  #pipeline: GPUComputePipeline | null = null;
  #bindGroupLayouts: GPUBindGroupLayout[];
  #layout: GPUPipelineLayout;
  #configManager = configManager;

  #bindGroup0: GPUBindGroup | null = null;
  #bindGroup1: GPUBindGroup | null = null;
  #bindGroup2: GPUBindGroup | null = null;
  #bindGroup3: GPUBindGroup | null = null;

  #canvasSize: Vector2 | null = null;
  #canvasSizeUniformBuffer: GPUBuffer;

  #configUniformBuffer: GPUBuffer;
  #tileUniformBuffer: GPUBuffer;

  #debugBuffer: GPUBuffer;
  #debugPixelTargetBuffer: GPUBuffer;
  #debugReadBuffer: GPUBuffer;

  #trianglesBuffer: GPUBuffer | undefined;
  #materialsBuffer: GPUBuffer | undefined;
  #bvhBuffer: GPUBuffer | undefined;
  #lightsCDFBuffer: GPUBuffer | undefined;
  #envmapPC2DBuffer: GPUBuffer | undefined;
  #envmapInfoBuffer: GPUBuffer | undefined;

  #resetSegment: ResetSegment;

  #tileSequence: TileSequence;

  #requestShaderCompilation = false;

  #scene: C2Scene | undefined;
  private camera!: Camera;
  #bvh: BVH | undefined;

  constructor(device: GPUDevice, tileSequence: TileSequence) {
    this.#device = device;
    this.#tileSequence = tileSequence;

    this.#resetSegment = new ResetSegment(device);

    this.passPerformance = new ComputePassPerformance(device);

    this.#bindGroupLayouts = [
      getBindGroupLayout(device, [
        { visibility: GPUShaderStage.COMPUTE, type: 'storage' },
        { visibility: GPUShaderStage.COMPUTE, type: 'storage' },
        { visibility: GPUShaderStage.COMPUTE, type: 'uniform' }
      ]),
      getBindGroupLayout(device, [
        { visibility: GPUShaderStage.COMPUTE, type: 'uniform' },
        { visibility: GPUShaderStage.COMPUTE, type: 'uniform' },
        { visibility: GPUShaderStage.COMPUTE, type: 'uniform' },
        { visibility: GPUShaderStage.COMPUTE, type: 'uniform' }
      ]),
      getBindGroupLayout(device, [
        { visibility: GPUShaderStage.COMPUTE, type: 'storage' },
        { visibility: GPUShaderStage.COMPUTE, type: 'uniform' }
      ]),
      device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'read-only-storage' }
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'read-only-storage' }
          },
          {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'read-only-storage' }
          },
          {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'read-only-storage' }
          },
          {
            binding: 4,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'read-only-storage' }
          },
          {
            binding: 5,
            visibility: GPUShaderStage.COMPUTE,
            texture: {}
          },
          {
            binding: 6,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'uniform' }
          }
        ]
      })
    ];
    this.#layout = device.createPipelineLayout({
      bindGroupLayouts: this.#bindGroupLayouts
    });

    // create a typedarray to hold the values for the uniforms in JavaScript
    this.#canvasSizeUniformBuffer = device.createBuffer({
      size: 2 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.#configUniformBuffer = device.createBuffer({
      size: configManager.bufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.#tileUniformBuffer = device.createBuffer({
      size: 4 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // these buffers will be assigned by setDebugPixelTarget
    this.#debugBuffer = device.createBuffer({ size: 0, usage: 1 });
    this.#debugPixelTargetBuffer = device.createBuffer({ size: 0, usage: 1 });
    this.#debugReadBuffer = device.createBuffer({ size: 0, usage: 1 });
    this.setDebugPixelTarget(0, 0);

    configManager.e.addEventListener('config-update', () => {
      this.updateConfig();
    });
    this.updateConfig();

    this.#requestShaderCompilation = true;
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
      layout: this.#bindGroupLayouts[2],
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

  updateCamera() {
    if (!this.camera) return;
    this.resetSamplesAndTile();

    this.camera.updateCameraBuffer();

    // we need to re-create the bindgroup since cameraUniformBuffer
    // is a new buffer
    this.#bindGroup1 = this.#device.createBindGroup({
      label: 'compute bindgroup - camera struct',
      layout: this.#bindGroupLayouts[1],
      entries: [
        { binding: 0, resource: { buffer: this.camera.cameraUniformBuffer } },
        { binding: 1, resource: { buffer: this.camera.cameraSampleUniformBuffer } },
        { binding: 2, resource: { buffer: this.#configUniformBuffer } },
        { binding: 3, resource: { buffer: this.#tileUniformBuffer } }
      ]
    });
  }

  updateConfig() {
    this.resetSamplesAndTile();

    this.#device.queue.writeBuffer(
      this.#configUniformBuffer,
      0,
      this.#configManager.getOptionsBuffer()
    );

    // if envmap scale changed, we'll need to recompute lightsCDFBuffer
    let envmap = this.#scene?.envmap;
    let updateEnvInfoBuffer = false;

    if (envmap && configManager.options.ENVMAP_SCALE != envmap.scale) {
      envmap.scale = configManager.options.ENVMAP_SCALE;

      let { LightsCDFBufferData, LightsCDFBufferDataByteSize } =
        this.#bvh!.getLightsCDFBufferData();
      this.#device.queue.writeBuffer(this.#lightsCDFBuffer!, 0, LightsCDFBufferData);
      updateEnvInfoBuffer = true;
    }

    if (
      envmap &&
      (configManager.options.ENVMAP_ROTX != envmap.rotX ||
        configManager.options.ENVMAP_ROTY != envmap.rotY)
    ) {
      envmap.rotX = configManager.options.ENVMAP_ROTX;
      envmap.rotY = configManager.options.ENVMAP_ROTY;
      updateEnvInfoBuffer = true;
    }

    if (envmap && updateEnvInfoBuffer) {
      envmap.updateEnvmapInfoBuffer(this.#device, this.#envmapInfoBuffer!);
    }

    if (
      envmap &&
      configManager.options.ENVMAP_USE_COMPENSATED_DISTRIBUTION !=
        configManager.prevOptions.ENVMAP_USE_COMPENSATED_DISTRIBUTION
    ) {
      let envmapDistributionBuffer = configManager.options.ENVMAP_USE_COMPENSATED_DISTRIBUTION
        ? envmap.compensatedDistribution.getBufferData()
        : envmap.distribution.getBufferData();
      this.#device.queue.writeBuffer(this.#envmapPC2DBuffer!, 0, envmapDistributionBuffer);
    }
  }

  updateTile(tile: Tile) {
    this.#device.queue.writeBuffer(
      this.#tileUniformBuffer,
      0,
      new Uint32Array([tile.x, tile.y, tile.w, tile.h])
    );
  }

  updateScene(scene: C2Scene) {
    this.resetSamplesAndTile();
    // if we have a new envmap, we might have to require a shader re-compilation
    this.#requestShaderCompilation = true;
    this.#scene = scene;

    if (this.camera) {
      this.camera.dispose();
    }
    this.camera = scene.camera;
    this.camera.setDevice(this.#device);
    this.camera.e.addEventListener('change', this.updateCamera.bind(this));
    this.updateCamera();

    const bvh = new BVH(scene);
    this.#bvh = bvh;
    let { trianglesBufferData, trianglesBufferDataByteSize, BVHBufferData, BVHBufferDataByteSize } =
      bvh.getBufferData();

    let { LightsCDFBufferData, LightsCDFBufferDataByteSize } = bvh.getLightsCDFBufferData();

    let materialsData = new Float32Array(scene.materials.map((mat) => mat.getFloatsArray()).flat());

    let envmap = scene.envmap || new Envmap();
    // this will, unfortunately, trigger the updateConfig() function in the next javascript tick
    // we should hopefully be able to fix this completely in svelte 5
    configManager.setStoreProperty({
      ENVMAP_SCALE: envmap.scale,
      ENVMAP_ROTX: envmap.rotX,
      ENVMAP_ROTY: envmap.rotY,
      shaderConfig: {
        ...configManager.options.shaderConfig,
        HAS_ENVMAP: scene.envmap ? true : false
      }
    });
    let envmapDistributionBuffer = configManager.options.ENVMAP_USE_COMPENSATED_DISTRIBUTION
      ? envmap.compensatedDistribution.getBufferData()
      : envmap.distribution.getBufferData();
    let { texture: envmapTexture } = envmap.getTexture(this.#device);

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

    this.#lightsCDFBuffer = this.#device.createBuffer({
      size: LightsCDFBufferDataByteSize /* determined with offset computer */,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.#envmapPC2DBuffer = this.#device.createBuffer({
      size: envmapDistributionBuffer.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.#envmapInfoBuffer = envmap.createEnvmapInfoBuffer(this.#device);

    this.#device.queue.writeBuffer(this.#trianglesBuffer, 0, trianglesBufferData);
    this.#device.queue.writeBuffer(this.#materialsBuffer, 0, materialsData);
    this.#device.queue.writeBuffer(this.#bvhBuffer, 0, BVHBufferData);
    this.#device.queue.writeBuffer(this.#lightsCDFBuffer, 0, LightsCDFBufferData);
    this.#device.queue.writeBuffer(this.#envmapPC2DBuffer, 0, envmapDistributionBuffer);

    // we need to re-create the bindgroup
    this.#bindGroup3 = this.#device.createBindGroup({
      label: 'compute bindgroup - scene data',
      layout: this.#bindGroupLayouts[3],
      entries: [
        { binding: 0, resource: { buffer: this.#trianglesBuffer! } },
        { binding: 1, resource: { buffer: this.#materialsBuffer! } },
        { binding: 2, resource: { buffer: this.#bvhBuffer! } },
        { binding: 3, resource: { buffer: this.#lightsCDFBuffer! } },
        { binding: 4, resource: { buffer: this.#envmapPC2DBuffer! } },
        { binding: 5, resource: envmapTexture.createView() },
        { binding: 6, resource: { buffer: this.#envmapInfoBuffer } }
      ]
    });
  }

  resize(canvasSize: Vector2, workBuffer: GPUBuffer, samplesCountBuffer: GPUBuffer) {
    this.#resetSegment.resize(canvasSize, workBuffer, samplesCountBuffer);
    this.#tileSequence.setCanvasSize(canvasSize);

    this.resetSamplesAndTile();

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
      layout: this.#bindGroupLayouts[0],
      entries: [
        { binding: 0, resource: { buffer: workBuffer } },
        { binding: 1, resource: { buffer: samplesCountBuffer } },
        { binding: 2, resource: { buffer: this.#canvasSizeUniformBuffer } }
      ]
    });
  }

  resetSamplesAndTile() {
    this.#tileSequence.resetTile();
    samplesInfo.reset();
  }

  increaseTileSize() {
    if (this.#tileSequence.canTileSizeBeIncreased()) {
      this.#tileSequence.increaseTileSize();
      // when we increase the tile size, the position doesn't change,
      // thus we'll re-draw a portion of the pixels that were part of the previous tile,
      // those pixels will need a new camera sample to properly accumulate new radiance values
      // otherwise they would count twice the results of the same camera sample
      this.camera.updateCameraSample();
    }
  }

  decreaseTileSize() {
    if (this.#tileSequence.canTileSizeBeDecreased()) {
      this.#tileSequence.decreaseTileSize();
      // when we decrease the tile size, the position doesn't change,
      // thus we'll re-draw a portion of the pixels that were part of the previous tile,
      // those pixels will need a new camera sample to properly accumulate new radiance values
      // otherwise they would count twice the results of the same camera sample
      this.camera.updateCameraSample();
    }
  }

  createPipeline() {
    const computeModule = this.#device.createShaderModule({
      label: 'compute module',
      code: getComputeShader()
    });

    this.#pipeline = this.#device.createComputePipeline({
      label: 'compute pipeline',
      layout: this.#layout,
      compute: {
        module: computeModule,
        entryPoint: 'computeSomething'
      }
    });
  }

  compute() {
    if (this.#requestShaderCompilation) {
      this.createPipeline();
      this.#requestShaderCompilation = false;
    }

    if (
      !this.#pipeline ||
      !this.#bindGroup0 ||
      !this.#bindGroup1 ||
      !this.#bindGroup2 ||
      !this.#bindGroup3 ||
      !this.#canvasSize
    ) {
      throw new Error('undefined bind groups / pipeline / canvasSize');
    }

    if (this.#canvasSize.x === 0 || this.#canvasSize.y === 0)
      throw new Error('canvas size dimensions is 0');

    if (samplesInfo.count === 0) {
      this.#tileSequence.resetTile();
      this.#resetSegment.reset();
      this.camera.resetSampler();
    }

    let tile = this.#tileSequence.getNextTile(
      /* on new sample / tile start */ () => {
        this.camera.updateCameraSample();
        samplesInfo.increment();
      }
    );
    this.updateTile(tile);

    // work group size in the shader is set to 8,8
    const workGroupsCount = this.#tileSequence.getWorkGroupCount();

    // Encode commands to do the computation
    const encoder = this.#device.createCommandEncoder({
      label: 'compute encoder'
    });
    const passDescriptor = {
      label: 'compute pass'
    };
    this.passPerformance.updateComputePassDescriptor(passDescriptor);
    const pass = encoder.beginComputePass(passDescriptor);
    pass.setPipeline(this.#pipeline);
    pass.setBindGroup(0, this.#bindGroup0);
    pass.setBindGroup(1, this.#bindGroup1);
    pass.setBindGroup(2, this.#bindGroup2);
    pass.setBindGroup(3, this.#bindGroup3);
    pass.dispatchWorkgroups(workGroupsCount.x, workGroupsCount.y);
    pass.end();

    if (this.#tileSequence.isTilePerformanceMeasureable()) {
      this.passPerformance.resolve(encoder);
    }

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
