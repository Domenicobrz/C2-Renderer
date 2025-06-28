import type { Vector2 } from 'three';
import { cameraMovementInfoStore } from '../routes/stores/main';
import { BVH } from './bvh/bvh';
import { ConfigManager } from './config';
import type { Camera } from './controls/Camera';
import { Orbit } from './controls/Orbit';
import type { C2Scene } from './createScene';
import { Envmap } from './envmap/envmap';
import { TextureArraysSegment } from './segment/textureArraysSegment';
import { EventHandler } from './eventHandler';

// A new class
export class SceneDataManager {
  public textureArraySegment: TextureArraysSegment = new TextureArraysSegment();
  public trianglesBuffer!: GPUBuffer;
  public materialsBuffer!: GPUBuffer;
  public bvhBuffer!: GPUBuffer;
  public lightsCDFBuffer!: GPUBuffer;
  public envmapPC2DBuffer!: GPUBuffer;
  public envmapPC2DArrayBuffer!: GPUBuffer;
  public envmapInfoBuffer!: GPUBuffer;

  public e = new EventHandler();

  public scene: C2Scene | undefined;
  public camera!: Camera;
  public envmapTexture!: GPUTexture;

  private bvh: BVH | undefined;
  private configManager = new ConfigManager();

  constructor(private device: GPUDevice) {
    this.configManager.e.addEventListener('config-update', () => {
      this.updateConfig();
    });
  }

  async update(scene: C2Scene) {
    // dispose of previously held resources
    this.dispose();

    this.scene = scene;
    this.camera = scene.camera;
    this.camera.e.addEventListener('change', this.onUpdateCamera.bind(this));

    // TODO: this function might take really long to complete,
    // we may want to async this and do it over a set of frames
    // rather than all at once
    this.textureArraySegment.update(scene.materials);

    const bvh = new BVH(scene);
    this.bvh = bvh;
    this.bvh.computeLightPickProbabilities();

    let { trianglesBufferData, trianglesBufferDataByteSize, BVHBufferData, BVHBufferDataByteSize } =
      bvh.getBufferData();

    let { LightsCDFBufferData, LightsCDFBufferDataByteSize } = bvh.getLightsCDFBufferData();

    // ********* important **********
    // we can't, unfortunately, use .flat() like in the commented line below.
    // When materials want to save a -1 integer as a float value,
    // they're making a bit-cast that results in bit values: 255 255 255 255
    // which is interpreted as a NaN when reading it as float.
    // .flat(), apparently, when copying NaN floats **sometimes** doesn't copy the floats
    // with the bit representation that I choose, but instead uses the standard/javascript
    // bit representation of NaN values which is: 0, 0, 192, 127
    // you can check it by typing: new Uint8Array(new Float32Array([NaN]).buffer)
    // in the console. I should have become a painter rather than dealing with this madness
    // ********* important **********
    // let materialsBufferData = new Float32Array(scene.materials.map((mat) => mat.getFloatsArray()).flat());
    let combinedArray: number[] = [];
    scene.materials.forEach((mat) => {
      let fa = mat.getFloatsArray();
      fa.forEach((v) => combinedArray.push(v));
    });
    let materialsBufferData = new Float32Array(combinedArray);

    let envmap = scene.envmap || new Envmap();
    // this will, unfortunately, trigger the updateConfig() function in the next javascript tick
    // we should hopefully be able to fix this completely in svelte 5
    this.configManager.setStoreProperty({
      ENVMAP_SCALE: envmap.scale,
      ENVMAP_ROTX: envmap.rotX,
      ENVMAP_ROTY: envmap.rotY,
      shaderConfig: {
        ...this.configManager.options.shaderConfig,
        HAS_ENVMAP: scene.envmap ? true : false
      }
    });
    let envmapDistributionBuffer = this.configManager.options.ENVMAP_USE_COMPENSATED_DISTRIBUTION
      ? envmap.compensatedDistribution.getBufferData()
      : envmap.distribution.getBufferData();

    let envmapDistributionArrayBuffer = this.configManager.options
      .ENVMAP_USE_COMPENSATED_DISTRIBUTION
      ? envmap.compensatedDistribution.getArrayData()
      : envmap.distribution.getArrayData();
    this.envmapTexture = envmap.getTexture(this.device).texture;

    this.trianglesBuffer = this.device.createBuffer({
      label: 'scene triangles',
      size: trianglesBufferDataByteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.materialsBuffer = this.device.createBuffer({
      label: 'scene materials',
      size: materialsBufferData.byteLength /* determined with offset computer */,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.bvhBuffer = this.device.createBuffer({
      label: 'scene bvh',
      size: BVHBufferDataByteSize /* determined with offset computer */,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.lightsCDFBuffer = this.device.createBuffer({
      label: 'scene light CDF',
      size: LightsCDFBufferDataByteSize /* determined with offset computer */,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.envmapPC2DBuffer = this.device.createBuffer({
      label: 'scene envmap PC2D',
      size: envmapDistributionBuffer.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.envmapPC2DArrayBuffer = this.device.createBuffer({
      label: 'scene envmap array',
      size: envmapDistributionArrayBuffer.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.envmapInfoBuffer = envmap.createEnvmapInfoBuffer(this.device);

    this.device.queue.writeBuffer(this.trianglesBuffer, 0, trianglesBufferData);
    this.device.queue.writeBuffer(this.materialsBuffer, 0, materialsBufferData);
    this.device.queue.writeBuffer(this.bvhBuffer, 0, BVHBufferData);
    this.device.queue.writeBuffer(this.lightsCDFBuffer, 0, LightsCDFBufferData);
    this.device.queue.writeBuffer(this.envmapPC2DBuffer, 0, envmapDistributionBuffer);
    this.device.queue.writeBuffer(this.envmapPC2DArrayBuffer, 0, envmapDistributionArrayBuffer);

    this.e.fireEvent('on-scene-update');
  }

  updateConfig() {
    // if envmap scale changed, we'll need to recompute lightsCDFBuffer
    let envmap = this.scene?.envmap;
    let updateEnvInfoBuffer = false;

    if (envmap && this.configManager.options.ENVMAP_SCALE != envmap.scale) {
      envmap.scale = this.configManager.options.ENVMAP_SCALE;

      this.bvh!.computeLightPickProbabilities();
      let {
        trianglesBufferData,
        trianglesBufferDataByteSize,
        BVHBufferData,
        BVHBufferDataByteSize
      } = this.bvh!.getBufferData();
      let { LightsCDFBufferData, LightsCDFBufferDataByteSize } = this.bvh!.getLightsCDFBufferData();

      this.device.queue.writeBuffer(this.lightsCDFBuffer!, 0, LightsCDFBufferData);
      this.device.queue.writeBuffer(this.trianglesBuffer!, 0, trianglesBufferData);
      this.device.queue.writeBuffer(this.bvhBuffer!, 0, BVHBufferData);
      // both .scale and .lightSourcePickProb of the envmap struct changed
      updateEnvInfoBuffer = true;
    }

    if (
      envmap &&
      (this.configManager.options.ENVMAP_ROTX != envmap.rotX ||
        this.configManager.options.ENVMAP_ROTY != envmap.rotY)
    ) {
      envmap.rotX = this.configManager.options.ENVMAP_ROTX;
      envmap.rotY = this.configManager.options.ENVMAP_ROTY;
      updateEnvInfoBuffer = true;
    }

    if (envmap && updateEnvInfoBuffer) {
      envmap.updateEnvmapInfoBuffer(this.device, this.envmapInfoBuffer!);
    }

    if (
      envmap &&
      this.configManager.options.ENVMAP_USE_COMPENSATED_DISTRIBUTION !=
        this.configManager.prevOptions.ENVMAP_USE_COMPENSATED_DISTRIBUTION
    ) {
      let envmapDistributionBuffer = this.configManager.options.ENVMAP_USE_COMPENSATED_DISTRIBUTION
        ? envmap.compensatedDistribution.getBufferData()
        : envmap.distribution.getBufferData();
      this.device.queue.writeBuffer(this.envmapPC2DBuffer!, 0, envmapDistributionBuffer);
    }
  }

  onUpdateCamera() {
    cameraMovementInfoStore.update((v) => {
      v.position = this.camera.position.clone();
      if (this.camera instanceof Orbit) {
        v.target = this.camera.target.clone();
      }
      return v;
    });
  }

  getFocusDistanceFromScreenPoint(point: Vector2, canvasSize: Vector2): number {
    if (!this.bvh) {
      return -1;
    }

    let ray = this.camera.screenPointToRay(point, canvasSize);
    let ires = this.bvh.intersectRay(ray.ro, ray.rd);

    if (ires.hit) {
      return this.camera.getFocusDistanceFromIntersectionPoint(ires.hitPoint);
    }

    return -1;
  }

  dispose() {
    this.trianglesBuffer?.destroy();
    this.materialsBuffer?.destroy();
    this.bvhBuffer?.destroy();
    this.lightsCDFBuffer?.destroy();
    this.envmapPC2DBuffer?.destroy();
    this.envmapPC2DArrayBuffer?.destroy();
    this.envmapInfoBuffer?.destroy();

    this.envmapTexture?.destroy();
    // no need to dispose these ones ourselves, they'll be disposed as new ones are
    // loaded. if we dispose manually here, we'll destroy the dummy textures
    // that can be used if no textures have been provided by the scene materials
    // this.textureArraySegment.dispose();

    this.camera?.dispose();

    this.bvh = undefined;
  }
}
