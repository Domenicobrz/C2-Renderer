import { AABB } from '$lib/bvh/aabb';
import { PC2D } from '$lib/samplers/PiecewiseConstant2D';
import { getLuminance } from '$lib/utils/getLuminance';
import { copySign } from '$lib/utils/math';
import { FloatType, Matrix4, Vector2, Vector3 } from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';

export class Envmap {
  private INFO_BUFFER_BYTE_LENGTH = 112;

  private SERIALIZATION_VERSION = 1;
  private size: Vector2 = new Vector2(0, 0);
  public luminanceAverage = 0;
  public scale = 1;
  public rotX = 0;
  public rotY = 0;
  private data: Float32Array = new Float32Array();
  public distribution = new PC2D([[0]], 1, 1, new AABB());
  public compensatedDistribution = new PC2D([[0]], 1, 1, new AABB());

  constructor() {}

  async fromEquirect(path: string, resolution: number = 400) {
    // texture data has 4 float elements for each pixel (rgba)
    // the fourth element of each pixel returned by this loader is always 1
    let hdrTexture = await new RGBELoader().setDataType(FloatType).loadAsync(path);

    // this.data = hdrTexture.source.data.data;
    // this.size = new Vector2(hdrTexture.source.data.width, hdrTexture.source.data.height);

    let equirectData = hdrTexture.source.data.data;
    let equirectSize = new Vector2(hdrTexture.source.data.width, hdrTexture.source.data.height);
    let radianceData = [];
    let luminanceData: number[][] = [];
    let thresholdedLuminanceData: number[][] = [];

    // I primi pixel sono in alto! gli ultimi sono in basso
    // ora facciamo un'altra cosa, cercheremo di creare la texture
    // con quel tipo di envmap. Per prima cosa, dobbiamo iterare su
    // size x x size y della envmap texture, e per ognuno di quei pixel,
    // cercheremo la 3d direction corrispondente, e prenderemo il pixel della hdr texture sopra
    let envmapSize = resolution;
    for (let i = 0; i < envmapSize; i++) {
      for (let j = 0; j < envmapSize; j++) {
        let hstep = 1 / (envmapSize * 2);
        let u = j / envmapSize + hstep;
        let v = i / envmapSize + hstep;

        // in teoria, dovremmo fare anche tutta quella cosa sull'interpolazione etc.
        let dir = this.equalAreaSquareToSphere(new Vector2(u, v));
        dir.normalize();

        let euv = new Vector2(Math.atan2(dir.z, dir.x), Math.asin(dir.y));
        euv.multiply(new Vector2(1 / (Math.PI * 2), 1 / Math.PI));
        euv.addScalar(0.5);

        // I think this is necessary because the equirect image is stored in memory
        // in such an order that requires a final negation of the y value
        euv.y = 1 - euv.y;

        let startIndex =
          Math.floor(euv.x * equirectSize.x) + Math.floor(euv.y * equirectSize.y) * equirectSize.x;

        let r = equirectData[startIndex * 4 + 0];
        let g = equirectData[startIndex * 4 + 1];
        let b = equirectData[startIndex * 4 + 2];

        // this was used to test that the brdf only approach
        // was matching MIS - I was setting envmapsize to 40
        // and then manually creating a "sun"
        // if (i == 20 && j == 30) {
        //   r = 400;
        //   g = 400;
        //   b = 400;
        // }

        radianceData.push(r, g, b, 1);

        let luminance = getLuminance(new Vector3(r, g, b));
        this.luminanceAverage += luminance;

        if (j === 0) luminanceData.push([]);
        luminanceData[i].push(luminance);
      }
    }
    this.luminanceAverage /= envmapSize * envmapSize;

    // TODO: ALSO CREATE THRESHOLDED LUMINANCE DATA
    for (let i = 0; i < envmapSize; i++) {
      for (let j = 0; j < envmapSize; j++) {
        if (j === 0) thresholdedLuminanceData.push([]);
        thresholdedLuminanceData[i].push(Math.max(luminanceData[i][j] - this.luminanceAverage, 0));
      }
    }

    // ---- note: ---- we won't have to re-create the distributions if we change the scale,
    // since they would change linearly. The BVH will pick the lightsource with the highest
    // contribution for that given sample, and the contribution uses luminanceAverage * scale,
    // not these distributions
    this.distribution = new PC2D(
      luminanceData,
      envmapSize,
      envmapSize,
      new AABB(new Vector3(0, 0, 0), new Vector3(1, 1, 0))
    );
    this.compensatedDistribution = new PC2D(
      thresholdedLuminanceData,
      envmapSize,
      envmapSize,
      new AABB(new Vector3(0, 0, 0), new Vector3(1, 1, 0))
    );

    // for (let i = 0; i < 300; i++) {
    //   let res = distribution.samplePC2D(new Vector2(Math.random(), Math.random()));
    //   // console.log(res.pdf, res.offset, res.floatOffset, luminanceData[res.offset.y][res.offset.x]);

    //   // mark as red sampled pixels
    //   let startIndex = res.offset.x + res.offset.y * envmapSize;
    //   radianceData[startIndex * 4 + 0] = 1;
    //   radianceData[startIndex * 4 + 1] = 0;
    //   radianceData[startIndex * 4 + 2] = 0;
    // }

    this.data = new Float32Array(radianceData);
    this.size = new Vector2(envmapSize, envmapSize);

    return this;
  }

  fromArrayBuffer(buffer: ArrayBuffer) {
    let version = new Uint32Array(buffer, 0, 1)[0];
    if (version != this.SERIALIZATION_VERSION) {
      throw new Error('envmap buffer is from an older version, re-run the envmap transform');
    }

    this.size.x = new Uint32Array(buffer, 1 * 4, 2)[0];
    this.size.y = new Uint32Array(buffer, 1 * 4, 2)[1];

    let fa1 = new Float32Array(buffer, 3 * 4, 4);
    this.luminanceAverage = fa1[0];
    this.scale = fa1[1];
    this.rotX = fa1[2];
    this.rotY = fa1[3];

    const radianceDataByteSize = this.size.x * this.size.y * 4 * 4;

    this.data = new Float32Array(buffer, 7 * 4, radianceDataByteSize / 4);

    let distributionByteSize = (buffer.byteLength - (7 * 4 + radianceDataByteSize)) / 2;

    this.distribution = new PC2D(
      buffer.slice(
        7 * 4 + radianceDataByteSize,
        7 * 4 + radianceDataByteSize + distributionByteSize
      )
    );
    this.compensatedDistribution = new PC2D(
      buffer.slice(
        7 * 4 + radianceDataByteSize + distributionByteSize,
        7 * 4 + radianceDataByteSize + distributionByteSize + distributionByteSize
      )
    );

    return this;
  }

  getArrayBuffer(): ArrayBuffer {
    let distributionBuffer = this.distribution.getBufferData();
    let compensatedDistributionBuffer = this.compensatedDistribution.getBufferData();

    let versionByteLength = 1 * 4;
    let sizeByteLength = 2 * 4;
    let luminanceAverageByteLength = 1 * 4;
    let scaleAndRotByteLength = 3 * 4;

    let totalByteLength =
      versionByteLength +
      sizeByteLength +
      luminanceAverageByteLength +
      scaleAndRotByteLength +
      this.data.byteLength +
      distributionBuffer.byteLength +
      compensatedDistributionBuffer.byteLength;

    let buffer = new ArrayBuffer(totalByteLength);
    let bufferViews = {
      version: new Uint32Array(buffer, 0, 1),
      size: new Uint32Array(buffer, 1 * 4, 2),
      luminanceAverage: new Float32Array(buffer, 3 * 4, 1),
      scale: new Float32Array(buffer, 4 * 4, 1),
      rotX: new Float32Array(buffer, 5 * 4, 1),
      rotY: new Float32Array(buffer, 6 * 4, 1),
      data: new Float32Array(buffer, 7 * 4, this.data.length),
      distributionBuffer: new Uint8Array(
        buffer,
        7 * 4 + this.data.byteLength,
        distributionBuffer.byteLength
      ),
      compensatedDistributionBuffer: new Uint8Array(
        buffer,
        7 * 4 + this.data.byteLength + distributionBuffer.byteLength,
        compensatedDistributionBuffer.byteLength
      )
    };

    bufferViews.version.set([this.SERIALIZATION_VERSION]);
    bufferViews.size.set([this.size.x, this.size.y]);
    bufferViews.luminanceAverage.set([this.luminanceAverage]);
    bufferViews.scale.set([this.scale]);
    bufferViews.rotX.set([this.rotX]);
    bufferViews.rotY.set([this.rotY]);
    bufferViews.data.set(this.data);
    bufferViews.distributionBuffer.set(new Uint8Array(distributionBuffer));
    bufferViews.compensatedDistributionBuffer.set(new Uint8Array(compensatedDistributionBuffer));

    return buffer;
  }

  equalAreaSquareToSphere(p: Vector2): Vector3 {
    let u = 2 * p.x - 1;
    let v = 2 * p.y - 1;
    let up = Math.abs(u);
    let vp = Math.abs(v);
    let signedDistance = 1 - (up + vp);
    let d = Math.abs(signedDistance);
    let r = 1 - d;
    let phi = ((r == 0 ? 1 : (vp - up) / r + 1) * Math.PI) / 4;
    let z = copySign(1 - r * r, signedDistance);
    let cosPhi = copySign(Math.cos(phi), u);
    let sinPhi = copySign(Math.sin(phi), v);

    let pbrtDir = new Vector3(
      cosPhi * r * Math.sqrt(2 - r * r),
      sinPhi * r * Math.sqrt(2 - r * r),
      z
    );
    let myDir = new Vector3(pbrtDir.x, pbrtDir.z, pbrtDir.y);

    return myDir;
  }

  equalAreaSphereToSquare(d: Vector3): Vector2 {
    // Why am I not swapping y and z here?
    // Why am I not swapping y and z here?
    // Why am I not swapping y and z here?
    // Why am I not swapping y and z here?
    // I'm doing it in the webgpu shader though and it works there
    // this function was never really used so I think not swapping is a mistake

    let x = Math.abs(d.x);
    let y = Math.abs(d.y);
    let z = Math.abs(d.z);

    // Compute the radius r
    let r = Math.sqrt(1.0 - z); // r = sqrt(1-|z|)

    // Compute the argument to atan (detect a=0 to avoid div-by-zero)
    let a = Math.max(x, y);
    var b = Math.min(x, y);
    if (a == 0) {
      b = 0;
    } else {
      b = b / a;
    }

    // Polynomial approximation of atan(x)*2/pi, x=b
    // Coefficients for 6th degree minimax approximation of atan(x)*2/pi,
    // x=[0,1].
    // const t1 = 0.406758566246788489601959989e-5;
    // const t2 = 0.636226545274016134946890922156;
    // const t3 = 0.61572017898280213493197203466e-2;
    // const t4 = -0.247333733281268944196501420480;
    // const t5 = 0.881770664775316294736387951347e-1;
    // const t6 = 0.419038818029165735901852432784e-1;
    // const t7 = -0.251390972343483509333252996350e-1;
    // let phi = EvaluatePolynomial(b, t1, t2, t3, t4, t5, t6, t7);
    var phi = (Math.atan(b) * 2) / Math.PI;

    // Extend phi if the input is in the range 45-90 degrees (u<v)
    if (x < y) {
      phi = 1 - phi;
    }

    // Find (u,v) based on (r,phi)
    var v = phi * r;
    var u = r - v;

    if (d.z < 0) {
      // southern hemisphere -> mirror u,v
      var temp = v;
      v = u;
      u = temp;

      u = 1 - u;
      v = 1 - v;
    }

    // Move (u,v) to the correct quadrant based on the signs of (x,y)
    u = copySign(u, d.x);
    v = copySign(v, d.y);

    // Transform (u,v) from [-1,1] to [0,1]
    return new Vector2(0.5 * (u + 1), 0.5 * (v + 1));
  }

  createEnvmapInfoBuffer(device: GPUDevice): GPUBuffer {
    const envmapInfoBuffer = device.createBuffer({
      size: this.INFO_BUFFER_BYTE_LENGTH /* determined with offset computer */,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.updateEnvmapInfoBuffer(device, envmapInfoBuffer);

    return envmapInfoBuffer;
  }

  updateEnvmapInfoBuffer(device: GPUDevice, buffer: GPUBuffer) {
    const EnvmapInfoValues = new ArrayBuffer(this.INFO_BUFFER_BYTE_LENGTH);
    const EnvmapInfoViews = {
      size: new Int32Array(EnvmapInfoValues, 0, 2),
      scale: new Float32Array(EnvmapInfoValues, 8, 1),
      transform: new Float32Array(EnvmapInfoValues, 16, 12),
      invTransform: new Float32Array(EnvmapInfoValues, 64, 12)
    };

    let matrix = new Matrix4().makeRotationAxis(new Vector3(0, 1, 0), this.rotX);
    matrix.multiply(new Matrix4().makeRotationAxis(new Vector3(1, 0, 0), this.rotY));
    let invMatrix = matrix.clone().invert();

    EnvmapInfoViews.size.set([this.size.x, this.size.y]);
    EnvmapInfoViews.scale.set([this.scale]);
    // matrix.elements is stored in column major order
    EnvmapInfoViews.transform.set(matrix.elements.slice(0, 12));
    EnvmapInfoViews.invTransform.set(invMatrix.elements.slice(0, 12));
    device.queue.writeBuffer(buffer, 0, EnvmapInfoValues);
  }

  getTexture(device: GPUDevice): { texture: GPUTexture } {
    // if this is an empty envmap return a bogus 1x1 texture
    if (this.size.x === 0) {
      const texture = device.createTexture({
        size: [1, 1],
        format: 'rgba32float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
      });

      device.queue.writeTexture(
        { texture },
        new Float32Array([1, 1, 1, 1]),
        { bytesPerRow: 1 * 16 },
        { width: 1, height: 1 }
      );

      return { texture };
    }

    const texture = device.createTexture({
      size: [this.size.x, this.size.y],
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });

    device.queue.writeTexture(
      { texture },
      this.data,
      { bytesPerRow: this.size.x * 16 },
      { width: this.size.x, height: this.size.y }
    );

    return { texture };
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct EnvmapInfo {
        size: vec2i,
        scale: f32,
        transform: mat3x3f,
        invTransform: mat3x3f,
      }
    `;
  }

  static shaderMethods(): string {
    return /* wgsl */ `
      fn envEqualAreaSquareToSphere(p: vec2f) -> vec3f {
        let u = 2 * p.x - 1;
        let v = 2 * p.y - 1;
        let up = abs(u);
        let vp = abs(v);
        let signedDistance = 1 - (up + vp);
        let d = abs(signedDistance);
        let r = 1 - d;

        // let phi = ((r == 0 ? 1 : (vp - up) / r + 1) * PI) / 4;
        var phi: f32 = 0;
        if (r == 0) {
          phi = 1;
        } else {
          phi = (vp - up) / r + 1.0;
        }
        phi = (phi * PI) / 4;
        
        let z = copysign(1 - r * r, signedDistance);
        let cosPhi = copysign(cos(phi), u);
        let sinPhi = copysign(sin(phi), v);

        let pbrtDir = vec3f(cosPhi * r * sqrt(2 - r * r), sinPhi * r * sqrt(2 - r * r), z);
        let myDir = pbrtDir.xzy; 
    
        return myDir;
      }

      // dir needs to be normalized 
      fn envEqualAreaSphereToSquare(dir: vec3f) -> vec2f {
        // swapping z with y since pbrt uses z as y
        // we're doing the same thing at the end of the
        // envEqualAreaSquareToSphere function 
        let d = vec3f(dir.x, dir.z, dir.y);
        
        let x = abs(d.x);
        let y = abs(d.y);
        let z = abs(d.z);

        // Compute the radius r
        let r = sqrt(1.0 - z);  // r = sqrt(1-|z|)

        // Compute the argument to atan (detect a=0 to avoid div-by-zero)
        let a = max(x, y);
        var b = min(x, y);
        if (a == 0) {
          b = 0;
        } else {
          b = b / a;
        }

        // Polynomial approximation of atan(x)*2/pi, x=b
        // Coefficients for 6th degree minimax approximation of atan(x)*2/pi,
        // x=[0,1].
        // const t1 = 0.406758566246788489601959989e-5;
        // const t2 = 0.636226545274016134946890922156;
        // const t3 = 0.61572017898280213493197203466e-2;
        // const t4 = -0.247333733281268944196501420480;
        // const t5 = 0.881770664775316294736387951347e-1;
        // const t6 = 0.419038818029165735901852432784e-1;
        // const t7 = -0.251390972343483509333252996350e-1;
        // let phi = EvaluatePolynomial(b, t1, t2, t3, t4, t5, t6, t7);
        var phi = atan(b) * 2 / PI;

        // Extend phi if the input is in the range 45-90 degrees (u<v)
        if (x < y) {
          phi = 1 - phi;
        }

        // Find (u,v) based on (r,phi)
        var v = phi * r;
        var u = r - v;

        if (d.z < 0) {
          // southern hemisphere -> mirror u,v
          var temp = v;
          v = u;
          u = temp;
          
          u = 1 - u;
          v = 1 - v;
        }

        // Move (u,v) to the correct quadrant based on the signs of (x,y)
        u = copysign(u, d.x);
        v = copysign(v, d.y);

        // Transform (u,v) from [-1,1] to [0,1]
        return vec2f(0.5 * (u + 1), 0.5 * (v + 1));
      }

      // there's another version of this function that takes 
      // uvs in the range [0...1]
      // https://github.com/mmp/pbrt-v4/blob/39e01e61f8de07b99859df04b271a02a53d9aeb2/src/pbrt/util/math.cpp#L363
      fn wrapEqualAreaSquare_discreteInputs(pp: vec2i, resolution: vec2i) -> vec2i {
        var p = pp;

        if (p.x < 0) {
          p.x = -p.x;                     // mirror across u = 0
          p.y = resolution.y - 1 - p.y;   // mirror across v = 0.5
        } else if (p.x >= resolution.x) {
          p.x = 2 * resolution.x - 1 - p.x;  // mirror across u = 1
          p.y = resolution.y - 1 - p.y;      // mirror across v = 0.5
        }

        if (p.y < 0) {
          p.x = resolution.x - 1 - p.x;   // mirror across u = 0.5
          p.y = -p.y;                     // mirror across v = 0;
        } else if (p.y >= resolution.y) {
          p.x = resolution.x - 1 - p.x;      // mirror across u = 0.5
          p.y = 2 * resolution.y - 1 - p.y;  // mirror across v = 1
        }

        // Bleh: things don't go as expected for 1x1 images.
        if (resolution.x == 1) {
          p.x = 0;
        }
        if (resolution.y == 1) {
          p.y = 0;
        }

        return p;
      }

      fn bilerpEnvmapTexels(p: vec2f, resolution: vec2i) -> vec4f {
        let x = p.x * f32(resolution.x) - 0.5; 
        let y = p.y * f32(resolution.y) - 0.5;

        let xi = i32(floor(x)); 
        let yi = i32(floor(y));

        let dx = x - f32(xi);
        let dy = y - f32(yi);

        let v0_discrete_uv = wrapEqualAreaSquare_discreteInputs(vec2i(xi, yi), resolution);
        let v1_discrete_uv = wrapEqualAreaSquare_discreteInputs(vec2i(xi+1, yi), resolution);
        let v2_discrete_uv = wrapEqualAreaSquare_discreteInputs(vec2i(xi, yi+1), resolution);
        let v3_discrete_uv = wrapEqualAreaSquare_discreteInputs(vec2i(xi+1, yi+1), resolution);

        let v0 = textureLoad(envmapTexture, v0_discrete_uv, 0);
        let v1 = textureLoad(envmapTexture, v1_discrete_uv, 0);
        let v2 = textureLoad(envmapTexture, v2_discrete_uv, 0);
        let v3 = textureLoad(envmapTexture, v3_discrete_uv, 0);

        return ((1 - dx) * (1 - dy) * v0 + dx * (1 - dy) * v1 +
                (1 - dx) *      dy  * v2 + dx *      dy  * v3);
      }

      fn getEnvmapRadiance(dir: vec3f) -> vec3f {
        let tdir = envmapInfo.transform * dir; 
        let uv = envEqualAreaSphereToSquare(tdir);

        let radiance = bilerpEnvmapTexels(uv, envmapInfo.size);

        // let radiance = textureLoad(
        //   envmapTexture, 
        //   vec2u(u32(uv.x * f32(envmapInfo.size.x)), u32(uv.y * f32(envmapInfo.size.y))), 
        //   0
        // );

        return radiance.xyz * envmapInfo.scale;
      }
    `;
  }
}
