import { EventHandler } from '$lib/eventHandler';
import { HaltonSampler } from '$lib/samplers/Halton';
import { Matrix4, PerspectiveCamera, Vector2, Vector3 } from 'three';
import { cameraInfoStore, cameraMovementInfoStore } from '../../routes/stores/main';
import { get } from 'svelte/store';
import { globals } from '$lib/C2';
import { vec2 } from '$lib/utils/math';
import { Plane } from '$lib/primitives/plane';

export class Camera {
  public e: EventHandler;

  public position: Vector3;
  public rotationMatrix: Matrix4;
  public viewMatrix: Matrix4;
  public projectionMatrix: Matrix4;

  private canvasSize: Vector2;

  public cameraSampleUniformBuffer: GPUBuffer;
  public cameraUniformBuffer: GPUBuffer;
  public cameraPositionUniformBuffer: GPUBuffer;
  public exposureUniformBuffer: GPUBuffer;
  public cameraMatrixUniformBuffer: GPUBuffer;
  public projectionMatrixUniformBuffer: GPUBuffer;

  private haltonSampler: HaltonSampler = new HaltonSampler();
  private device: GPUDevice;

  private requestedBuffersUpdate: boolean = false;

  protected canvasContainerEl!: HTMLDivElement;

  constructor() {
    this.e = new EventHandler();
    this.position = new Vector3(0, 0, -20);
    this.rotationMatrix = new Matrix4().identity();
    this.viewMatrix = new Matrix4().identity();
    this.projectionMatrix = new Matrix4().identity();

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
    this.cameraMatrixUniformBuffer = this.device.createBuffer({
      size: 16 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.projectionMatrixUniformBuffer = this.device.createBuffer({
      size: 16 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.cameraPositionUniformBuffer = this.device.createBuffer({
      size: 3 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.fov = Math.PI * 0.25;
    this.aperture = 0.1;
    this.focusDistance = 10;
    this.exposure = 1;
    this.canvasSize = vec2(-1, -1);
    this.tiltShift = vec2(0, 0);

    cameraInfoStore.subscribe((_) => {
      this.requestedBuffersUpdate = true;
      this.e.fireEvent('change');
    });
    this.e.addEventListener('change', () => {
      this.requestedBuffersUpdate = true;
    });
  }

  setCanvasContainer(canvasContainer: HTMLDivElement) {
    this.canvasContainerEl = canvasContainer;
  }

  onCanvasResize(canvasSize: Vector2) {
    this.canvasSize = canvasSize;
    this.requestedBuffersUpdate = true;
  }

  get rotationSpeed() {
    return get(cameraMovementInfoStore).rotationSpeed;
  }
  set rotationSpeed(value) {
    cameraMovementInfoStore.update((v) => {
      v.rotationSpeed = value;
      return v;
    });
  }
  get movementSpeed() {
    return get(cameraMovementInfoStore).movementSpeed;
  }
  set movementSpeed(value) {
    cameraMovementInfoStore.update((v) => {
      v.movementSpeed = value;
      return v;
    });
  }

  get exposure() {
    return get(cameraInfoStore).exposure;
  }
  set exposure(value) {
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

  get tiltShift() {
    return get(cameraInfoStore).tiltShift;
  }
  set tiltShift(value) {
    cameraInfoStore.update((v) => {
      v.tiltShift = value;
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

  renderLoopUpdate() {
    if (this.requestedBuffersUpdate) {
      this.updateCameraBuffer();
      this.updateCameraMatricesBuffers();
      this.updateExposureUniformBuffer();
      this.requestedBuffersUpdate = false;
    }
  }

  updateExposureUniformBuffer() {
    this.device.queue.writeBuffer(this.exposureUniformBuffer, 0, new Float32Array([this.exposure]));
  }

  // used on preview and realtime segments
  updateCameraMatricesBuffers() {
    this.viewMatrix.identity();
    this.viewMatrix.multiplyMatrices(this.viewMatrix, this.rotationMatrix.clone().invert());
    this.viewMatrix.multiplyMatrices(
      this.viewMatrix,
      new Matrix4().makeTranslation(this.position).invert()
    );

    this.device.queue.writeBuffer(
      this.cameraMatrixUniformBuffer,
      0,
      new Float32Array(this.viewMatrix.elements)
    );

    // https://www.scratchapixel.com/lessons/3d-basic-rendering/perspective-and-orthographic-projection-matrix/opengl-perspective-projection-matrix.html
    let aspectRatio = this.canvasSize.x / this.canvasSize.y;
    let near = 0.1;
    let far = 10000;
    let top = Math.tan(this.fov * 0.5) * near;
    let bottom = -top;
    let right = top * aspectRatio;
    let left = -top * aspectRatio;

    let n = near,
      f = far,
      t = top,
      r = right,
      b = bottom,
      l = left;

    this.device.queue.writeBuffer(
      this.projectionMatrixUniformBuffer,
      0,
      // this is the row-major version, which doesn't seem to work
      // below this one I'm using the column-major version

      // new Float32Array([
      //   (2 * n) / (r - l),
      //   0,
      //   (r + l) / (r - l),
      //   0,

      //   0,
      //   (2 * n) / (t - b),
      //   (t + b) / (t - b),
      //   0,

      //   0,
      //   0,
      //   -(f + n) / (f - n),
      //   -(2 * f * n) / (f - n),

      //   0,
      //   0,
      //   -1,
      //   0
      // ])

      new Float32Array([
        (2 * n) / (r - l),
        0,
        0,
        0,

        0,
        (2 * n) / (t - b),
        0,
        0,

        (r + l) / (r - l),
        (t + b) / (t - b),
        -(f + n) / (f - n),
        -1,

        0,
        0,
        -(2 * f * n) / (f - n),
        0
      ])
    );

    this.device.queue.writeBuffer(
      this.cameraPositionUniformBuffer,
      0,
      new Float32Array([this.position.x, this.position.y, this.position.z])
    );
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
        this.tiltShift.x,
        this.tiltShift.y
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

  getFocusDistanceFromIntersectionPoint(point: Vector3) {
    // simple solution, won't work with tilt shift
    // let dir = point.clone().sub(this.position);
    // var w = new Vector3(0, 0, 1).normalize();
    // w = w.applyMatrix4(this.rotationMatrix);
    // return dir.dot(w);

    // general solution that works for tilt shift
    let vec = point.clone().sub(this.position).applyMatrix4(this.rotationMatrix.clone().invert());
    let dir = vec.clone().normalize();

    let plane = new Plane(new Vector3(this.tiltShift.x, this.tiltShift.y, -1), 1);
    let ires = plane.intersectRay(new Vector3(0, 0, 0), dir);

    let tVec = vec.length();
    let tPlane = ires.t;

    return tVec / tPlane;
  }

  screenPointToRay(point: Vector2, canvasSize: Vector2) {
    let nuv = new Vector2((point.x / canvasSize.x) * 2 - 1, (point.y / canvasSize.y) * 2 - 1);

    let aspectRatio = canvasSize.x / canvasSize.y;
    let fovTangent = Math.tan(this.fov * 0.5);
    var rd = new Vector3(fovTangent * nuv.x * aspectRatio, fovTangent * nuv.y, 1.0).normalize();
    rd = rd.applyMatrix4(this.rotationMatrix);

    return {
      ro: this.position.clone(),
      rd
    };
  }

  static shaderMethods() {
    return /* wgsl */ `
      fn getCameraRay(tid: vec3u, idx: u32, contribution: ptr<function, f32>) -> Ray {
        // if you change the inner workings of ray direction creation,
        // also remember to update screenPointToRay(...)

        *contribution = 1.0;

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

        // ***** old method, no tilt shift
        // let focalDistance = camera.focusDistance * (1.0 / rd.z);
        // let focalPoint = rd * focalDistance;
        // ***** new method, with tilt shift 
        var focalPoint = vec3f(0);
        let planeDir = normalize(vec3f(camera.tiltShift.x, camera.tiltShift.y, -1));
        let intersected = intersectPlane(
          Ray(vec3f(0), rd), planeDir, camera.focusDistance * -planeDir.z, &focalPoint
        );

        let r1 = rand4(tid.x * 31472 + tid.y * 71893);
        let dofRands = vec2f(
          fract(r1.x + cameraSample.z),
          fract(r1.y + cameraSample.w),
        );
        var offsetRadius = aperture * sqrt(dofRands.x);
        let offsetTheta = dofRands.y * 2.0 * PI;
        var originOffset = vec3f(offsetRadius * cos(offsetTheta), offsetRadius * sin(offsetTheta), 0.0);
        

        // cat-eyed bokeh
        var oo = (originOffset / aperture).xy;
        let screenDir = -normalize(rd.xy);
        let screenDirNorm = vec2f(-screenDir.y, screenDir.x);
        // vector projection 
        // https://math.stackexchange.com/questions/4646578/finding-the-projection-of-a-vector-onto-another-vector
        let projectionDistance = abs(dot(oo, screenDir) / dot(screenDir, screenDir));
        let effectMult = 1.0; // 1.0;
        let effectPow = 2.0;
        let screenRayLength = length(rd.xy);
        let newAperture = mix(aperture, 0.0, projectionDistance * effectMult * screenRayLength * pow(1.0 + screenRayLength, effectPow));    

        let A = effectMult * screenRayLength * pow(1.0 + screenRayLength, effectPow);
        let xt = 1.0 / (A + 1.0);
        let apertureAtEdge = mix(1.0, 0.0, xt * A); 

        *contribution = 0.0;
        for(var i = 0; i < 10; i++) {
          let rds = rand4(tid.x * 31472 + tid.y * 71893 + u32(i) * 19537);
          let r0 = fract(rds.x + cameraSample.z);
          let r1 = fract(rds.y + cameraSample.w);

          var oo = screenDir * (r0 * 2 - 1) * apertureAtEdge;
          oo = oo + screenDirNorm * (r1 * 2 - 1);    
        
          let offsetRadius = length(oo);
          if (offsetRadius > 1.0) {
            continue;
          }
        
          let projectionDistance = abs(dot(oo, screenDir) / dot(screenDir, screenDir));
          let t = projectionDistance * A;
          let newAperture = mix(1.0, 0.0, t);

          if (offsetRadius > newAperture) {
            continue;
          }

          originOffset = vec3f(oo * aperture, 0.0);
          // the contribution adjustment is not necessary now that we're drawing 
          // these 10 samples according to the apertureAtEdge distribution,
          // since it's extremely likely that we'll find a valid sample
          *contribution = 1.0;
          break;
        }

        rd = normalize(camera.rotMatrix * normalize(focalPoint - originOffset));
      
        originOffset = camera.rotMatrix * originOffset;
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
        rotMatrix: mat3x3f,
        aperture: f32,
        focusDistance: f32,
        tiltShift: vec2f,
      }
      struct Ray {
        origin: vec3f,
        direction: vec3f,
      }
    `;
  }
}
