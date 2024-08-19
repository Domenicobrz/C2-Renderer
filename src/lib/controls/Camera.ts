import { EventHandler } from '$lib/eventHandler';
import { HaltonSampler } from '$lib/samplers/Halton';
import { Matrix4, Vector3 } from 'three';
import { cameraInfoStore } from '../../routes/stores/main';
import { get } from 'svelte/store';
import { globals } from '$lib/C2';

export class Camera {
  public e: EventHandler;

  public position: Vector3;
  public rotationMatrix: Matrix4;

  public cameraSampleUniformBuffer: GPUBuffer;
  public cameraUniformBuffer: GPUBuffer;
  public exposureUniformBuffer: GPUBuffer;

  private haltonSampler: HaltonSampler = new HaltonSampler();
  private device: GPUDevice;

  constructor() {
    this.e = new EventHandler();
    this.position = new Vector3(0, 0, -10);
    this.rotationMatrix = new Matrix4().identity();

    this.device = globals.device;
    this.cameraSampleUniformBuffer = this.device.createBuffer({
      size: 4 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.cameraUniformBuffer = this.device.createBuffer({
      size: 80 /* determined with offset computer */,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.exposureUniformBuffer = this.device.createBuffer({
      size: 1 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.fov = Math.PI * 0.25;
    this.aperture = 0.1;
    this.focusDistance = 10;
    this.exposure = 1;

    cameraInfoStore.subscribe((_) => {
      this.updateCameraBuffer();
      this.updateExposureUniformBuffer();
      this.e.fireEvent('change');
    });
  }

  get exposure() {
    console.log('returning exposure: ', get(cameraInfoStore).exposure);
    return get(cameraInfoStore).exposure;
  }
  set exposure(value) {
    console.log('setting exposure: ', value);
    cameraInfoStore.update((v) => {
      v.exposure = value;
      return v;
    });
  }

  get fov() {
    return get(cameraInfoStore).fov;
  }
  set fov(value) {
    cameraInfoStore.update((v) => {
      v.fov = value;
      return v;
    });
  }

  get aperture() {
    return get(cameraInfoStore).aperture;
  }
  set aperture(value) {
    cameraInfoStore.update((v) => {
      v.aperture = value;
      return v;
    });
  }

  get focusDistance() {
    return get(cameraInfoStore).focusDistance;
  }
  set focusDistance(value) {
    cameraInfoStore.update((v) => {
      v.focusDistance = value;
      return v;
    });
  }

  dispose() {
    // sets the resource as garbage-collectable
    (this.cameraSampleUniformBuffer as any) = null;
    // removes all previous event handlers
    this.e = new EventHandler();
  }

  resetSampler() {
    this.haltonSampler.reset();
  }

  updateExposureUniformBuffer() {
    this.device.queue.writeBuffer(this.exposureUniformBuffer, 0, new Float32Array([this.exposure]));
  }

  updateCameraBuffer() {
    this.device.queue.writeBuffer(
      this.cameraUniformBuffer,
      0,
      new Float32Array([
        this.position.x,
        this.position.y,
        this.position.z,
        this.fov,
        this.rotationMatrix.elements[0],
        this.rotationMatrix.elements[1],
        this.rotationMatrix.elements[2],
        0,
        this.rotationMatrix.elements[4],
        this.rotationMatrix.elements[5],
        this.rotationMatrix.elements[6],
        0,
        this.rotationMatrix.elements[8],
        this.rotationMatrix.elements[9],
        this.rotationMatrix.elements[10],
        0,
        this.aperture,
        this.focusDistance,
        0,
        0 // padding
      ])
    );
  }

  updateCameraSample() {
    let sample = this.haltonSampler.get4DSample();
    this.device.queue.writeBuffer(
      this.cameraSampleUniformBuffer,
      0,
      new Float32Array([sample.x, sample.y, sample.z, sample.w])
    );
  }

  static shaderMethods() {
    return /* wgsl */ `
      fn getCameraRay(tid: vec3u, idx: u32) -> Ray {
          // from [0...1] to [-1...+1]
        let nuv = vec2f(
          (f32(tid.x) + cameraSample.x) / f32(canvasSize.x) * 2 - 1,
          (f32(tid.y) + cameraSample.y) / f32(canvasSize.y) * 2 - 1,
        );
      
        let aspectRatio = f32(canvasSize.x) / f32(canvasSize.y);
        let fovTangent = tan(camera.fov * 0.5);
        var rd = normalize(vec3f(
          fovTangent * nuv.x * aspectRatio, 
          fovTangent * nuv.y, 
          1.0
        ));
      
        // aperture calculations
        let aperture = camera.aperture;
        let focalDistance = camera.focusDistance * (1.0 / rd.z);
        let focalPoint = rd * focalDistance;
        let r1 = rand4(tid.x * 31472 + tid.y * 71893);
        let dofRands = vec2f(
          fract(r1.x + cameraSample.z),
          fract(r1.y + cameraSample.w),
        );
        let offsetRadius = aperture * sqrt(dofRands.x);
        let offsetTheta = dofRands.y * 2.0 * PI;
        var originOffset = vec3f(offsetRadius * cos(offsetTheta), offsetRadius * sin(offsetTheta), 0.0);
        rd = camera.rotationMatrix * normalize(focalPoint - originOffset);
      
        originOffset = camera.rotationMatrix * originOffset;
        let ro = camera.position + originOffset;

        return Ray(ro, rd);
      }
    `;
  }

  static shaderStruct() {
    return /* wgsl */ `
      struct Camera {
        position: vec3f,
        fov: f32,
        rotationMatrix: mat3x3f,
        aperture: f32,
        focusDistance: f32,
      }
      struct Ray {
        origin: vec3f,
        direction: vec3f,
      }
    `;
  }
}
