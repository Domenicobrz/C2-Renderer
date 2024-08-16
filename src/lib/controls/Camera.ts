import { EventHandler } from '$lib/eventHandler';
import { HaltonSampler } from '$lib/samplers/Halton';
import { Matrix4, Vector3 } from 'three';

export class Camera {
  public e: EventHandler;
  public position: Vector3;
  public rotationMatrix: Matrix4;
  public fov: number;
  public cameraSampleUniformBuffer!: GPUBuffer;
  public cameraUniformBuffer!: GPUBuffer;

  private haltonSampler: HaltonSampler = new HaltonSampler();
  private device!: GPUDevice;

  constructor() {
    this.e = new EventHandler();
    this.position = new Vector3(0, 0, -10);
    this.rotationMatrix = new Matrix4().identity();
    this.fov = Math.PI * 0.25;
  }

  dispose() {
    // sets the resource as garbage-collectable
    (this.cameraSampleUniformBuffer as any) = null;
    // removes all previous event handlers
    this.e = new EventHandler();
  }

  setDevice(device: GPUDevice) {
    this.device = device;
    this.cameraSampleUniformBuffer = device.createBuffer({
      size: 2 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.cameraUniformBuffer = device.createBuffer({
      size: 4 * 16 /* determined with offset computer */,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
  }

  resetSampler() {
    this.haltonSampler.reset();
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
        0
      ])
    );
  }

  updateCameraSample() {
    let sample = this.haltonSampler.get2DSample();
    this.device.queue.writeBuffer(
      this.cameraSampleUniformBuffer,
      0,
      new Float32Array([sample.x, sample.y])
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
        let aperture = 0.2;
        let focalDistance = 12.5 * (1.0 / rd.z);
        let focalPoint = rd * focalDistance;
        let cameraRands = rand4(tid.y * canvasSize.x + tid.x * 3 + 21841287 + samplesCount[idx] * 98237);
        let offsetRadius = aperture * sqrt(cameraRands.x);
        let offsetTheta = cameraRands.y * 2.0 * PI;
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
      }
      struct Ray {
        origin: vec3f,
        direction: vec3f,
      }
    `;
  }
}
