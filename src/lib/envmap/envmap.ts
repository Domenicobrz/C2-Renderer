import { AABB } from '$lib/bvh/aabb';
import { PC2D } from '$lib/samplers/PiecewiseConstant2D';
import { getLuminance } from '$lib/utils/getLuminance';
import { copySign } from '$lib/utils/math';
import { FloatType, Vector2, Vector3 } from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';

export class Envmap {
  #data: Float32Array = new Float32Array();
  #size: Vector2 = new Vector2(0, 0);

  public luminanceAverage = 0;
  public scale = 1;
  public distribution = new PC2D([[0]], 1, 1, new AABB());
  public compensatedDistribution = new PC2D([[0]], 1, 1, new AABB());

  constructor() {}

  async fromEquirect(path: string) {
    // texture data has 4 float elements for each pixel (rgba)
    // the fourth element of each pixel returned by this loader is always 1
    let hdrTexture = await new RGBELoader().setDataType(FloatType).loadAsync(path);

    // this.#data = hdrTexture.source.data.data;
    // this.#size = new Vector2(hdrTexture.source.data.width, hdrTexture.source.data.height);

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
    let envmapSize = 300;
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

    // create pc2d and sample it a few times just to test it
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

    this.#data = new Float32Array(radianceData);
    this.#size = new Vector2(envmapSize, envmapSize);
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

  // should be deleted at some point
  // should be deleted at some point
  // should be deleted at some point
  getBufferData(): { data: ArrayBuffer; byteSize: number } {
    if (this.#size.x === 0) {
      return { data: new ArrayBuffer(0), byteSize: 0 };
    }

    // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d00000100c700000000000000003d888b0237284d3025f2381bcb28883f05c6e901ed37dc16b0f1f435309be2d90166cce262d8c5e7adeddccdafa144338e0eb1645ccfab141e4e9daeee7674a4f9a4481fbb1c9132325e382296f19e7fb492e794495847c565e1fb67fe4c7d8af2ae57ef47271844a1313018e4fee660f52b197fb5551fc3c01c5c83452fdad9cb499ffff5ffbd00
    const byteSize = 16 + 16 * this.#size.x * this.#size.y;
    const EnvmapValues = new ArrayBuffer(byteSize);
    const EnvmapViews = {
      size: new Int32Array(EnvmapValues, 0, 2),
      data: new Float32Array(EnvmapValues, 16, this.#size.x * this.#size.y * 4)
    };

    EnvmapViews.size.set([this.#size.x, this.#size.y]);

    for (let i = 0; i < this.#data.length; i += 4) {
      let r = this.#data[i + 0];
      let g = this.#data[i + 1];
      let b = this.#data[i + 2];
      EnvmapViews.data.set([r, g, b], i);
    }

    return {
      data: EnvmapValues,
      byteSize
    };
  }

  // should be deleted at some point
  // should be deleted at some point
  // should be deleted at some point
  getData(): { data: Float32Array; size: Vector2 } {
    return { data: this.#data, size: this.#size };
  }

  getTextureData(device: GPUDevice): { sampler: GPUSampler; texture: GPUTexture } {
    const sampler = device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'nearest',
      minFilter: 'nearest'
    });

    // if this is an empty envmap return a bogus 1x1 texture
    if (this.#size.x === 0) {
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

      return { sampler, texture };
    }

    const texture = device.createTexture({
      size: [this.#size.x, this.#size.y],
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });

    device.queue.writeTexture(
      { texture },
      this.#data,
      { bytesPerRow: this.#size.x * 16 },
      { width: this.#size.x, height: this.#size.y }
    );

    return { texture, sampler };
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct Envmap {
        size: vec2i,
        data: array<vec3f>,
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

      fn getEnvmapRadiance(dir: vec3f) -> vec3f {
        let uv = envEqualAreaSphereToSquare(dir);
        let radiance = textureLoad(
          envmapTexture, 
          vec2u(u32(uv.x * f32(envmapPC2D.size.x)), u32(uv.y * f32(envmapPC2D.size.y))), 
          0
        );

        return radiance.xyz;
      }
    `;
  }
}
