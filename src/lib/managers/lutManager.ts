import { loadArrayBuffer } from '$lib/utils/loadArrayBuffer';

export enum LUTtype {
  MultiScatterTorranceSparrow,
  MultiScatterDielectricEo,
  MultiScatterDielectricEoInverse,
  MultiScatterDielectricEavg,
  MultiScatterDielectricEavgInverse
}
let lutTypeShaderPart = /* wgsl */ `
  const LUT_MultiScatterTorranceSparrow = 0;
  const LUT_MultiScatterDielectricEo = 1;
  const LUT_MultiScatterDielectricEoInverse = 2;
  const LUT_MultiScatterDielectricEavg = 3;
  const LUT_MultiScatterDielectricEavgInverse = 4;
`;

export class LUTManager {
  private cache: Record<string, ArrayBuffer> = {};
  private offsetsShaderPart = '';
  private zOffsetPointer = 0;
  private lut32data: number[] = [];
  private device: GPUDevice;

  constructor(device: GPUDevice) {
    this.device = device;
  }

  async load(path: string, type: LUTtype) {
    if (!this.cache[path]) {
      let buffer = await loadArrayBuffer(path);
      if (!buffer) throw new Error("Couldn't load buffer: " + path);

      this.cache[path] = buffer;
    }

    let buffer = this.cache[path];

    let headerBytes = 4 * 4;
    let headerView = new Uint32Array(buffer, 0, 4);

    let channels = headerView[0];
    let sizeX = headerView[1];
    let sizeY = headerView[2];
    let sizeZ = headerView[3];

    let data = new Float32Array(buffer, headerBytes, sizeX * sizeY * sizeZ * channels);

    if (type == LUTtype.MultiScatterTorranceSparrow) {
      this.offsetsShaderPart += /* wgsl */ `
        if (lutType == LUT_MultiScatterTorranceSparrow) {
          zOffset = ${this.zOffsetPointer};
          useBilinearInterpolation = true;
        }
      `;
    }

    if (type == LUTtype.MultiScatterDielectricEo) {
      this.offsetsShaderPart += /* wgsl */ `
        if (lutType == LUT_MultiScatterDielectricEo) {
          zOffset = ${this.zOffsetPointer};
          useBilinearInterpolation = true;
        }
      `;
    }

    if (type == LUTtype.MultiScatterDielectricEoInverse) {
      this.offsetsShaderPart += /* wgsl */ `
        if (lutType == LUT_MultiScatterDielectricEoInverse) {
          zOffset = ${this.zOffsetPointer};
          useBilinearInterpolation = true;
        }
      `;
    }

    if (type == LUTtype.MultiScatterDielectricEavg) {
      this.offsetsShaderPart += /* wgsl */ `
        if (lutType == LUT_MultiScatterDielectricEavg) {
          zOffset = ${this.zOffsetPointer};
          useBilinearInterpolation = true;
        }
      `;
    }

    if (type == LUTtype.MultiScatterDielectricEavgInverse) {
      this.offsetsShaderPart += /* wgsl */ `
        if (lutType == LUT_MultiScatterDielectricEavgInverse) {
          zOffset = ${this.zOffsetPointer};
          useBilinearInterpolation = true;
        }
      `;
    }

    this.zOffsetPointer += sizeZ;

    this.storeLUTdata(sizeX, sizeY, sizeZ, channels, data);

    return {
      arrayData: data
    };
  }

  storeLUTdata(sx: number, sy: number, sz: number, channels: number, data: Float32Array) {
    if (sx != 32)
      throw new Error(
        'size of LUT is not 32 - implementation of 64x64x64 LUTs is not completed yet'
      );

    for (let z = 0; z < sz; z++) {
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          // even for single-lines LUT, we'll still cover an entire
          // 32x32 layer to simplify the implementation.
          // The two checks below will do that
          if (y >= sy) {
            this.lut32data.push(0, 0, 0, 0);
            continue;
          } else if (x >= sx) {
            this.lut32data.push(0, 0, 0, 0);
            continue;
          }

          for (let c = 0; c < 4; c++) {
            if (c >= channels) {
              this.lut32data.push(0);
              continue;
            }

            this.lut32data.push(
              data[z * 32 * 32 * channels + y * 32 * channels + x * channels + c]
            );
          }
        }
      }
    }
  }

  getTexture(): GPUTexture {
    let layers = Math.max(this.lut32data.length / (32 * 32 * 4), 1);

    const lut32texture = this.device.createTexture({
      label: 'lut 32 texture 3D',
      size: [32, 32, layers],
      dimension: '3d', // defaults to 2d so it's best to set it here
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });

    if (this.lut32data.length > 0) {
      this.device.queue.writeTexture(
        { texture: lut32texture },
        new Float32Array(this.lut32data),
        { bytesPerRow: 32 * 4 * 4, rowsPerImage: 32 },
        { width: 32, height: 32, depthOrArrayLayers: layers }
      );
    }

    return lut32texture;
  }

  getShaderPart() {
    return /* wgsl */ `
      ${lutTypeShaderPart}

      fn interpolateLUTbilinear(uv: vec3f, zOffset: i32) -> vec4f {
        let clampedUv = clamp(uv, vec3f(0.0), vec3f(0.99999));

        let oneOver32  = 0.03125;  // <-- single texel size on a 32x32 LUT
        var duv = mod3f(clampedUv, vec3f(oneOver32)) / oneOver32;
        let yo: i32 = select(-1, 1, duv.y >= 0.5);
        let xo: i32 = select(-1, 1, duv.x >= 0.5);

        let discreteUv0 = vec3i(
          i32(clampedUv.x * 32),
          i32(clampedUv.y * 32),
          i32(clampedUv.z * 32) + zOffset,
        );
        let isDXOver32OrUnder0 = (discreteUv0.x + xo >= 32) || (discreteUv0.x + xo < 0);
        let isDYOver32OrUnder0 = (discreteUv0.y + yo >= 32) || (discreteUv0.y + yo < 0);

        let discreteUvPlusX = vec3i(
          select(discreteUv0.x + xo, discreteUv0.x, isDXOver32OrUnder0),
          discreteUv0.y,
          discreteUv0.z,
        );
        let discreteUvPlusY = vec3i(
          discreteUv0.x,
          select(discreteUv0.y + yo, discreteUv0.y, isDYOver32OrUnder0),
          discreteUv0.z,
        );
        let discreteUvPlusXY = vec3i(
          select(discreteUv0.x + xo, discreteUv0.x, isDXOver32OrUnder0),
          select(discreteUv0.y + yo, discreteUv0.y, isDYOver32OrUnder0),
          discreteUv0.z,
        );
        
        let v = textureLoad(lut32, discreteUv0, 0);
        let vx = textureLoad(lut32, discreteUvPlusX, 0);
        let vy = textureLoad(lut32, discreteUvPlusY, 0);
        let vxy = textureLoad(lut32, discreteUvPlusXY, 0);

        let tx = select(0.5 - duv.x, duv.x - 0.5, duv.x >= 0.5);
        let ty = select(0.5 - duv.y, duv.y - 0.5, duv.y >= 0.5);

        let v0 = mix(v, vx, tx);
        let v1 = mix(vy, vxy, tx);
        let interpolatedValue = mix(v0, v1, ty);

        return interpolatedValue;
      }

      fn getLUTvalue(uv: vec3f, lutType: u32) -> vec4f {
        var useTrilinearInterpolation = false;
        var useBilinearInterpolation = false;
        var useLinearInterpolation = false;
        var value = vec4f(0);

        var zOffset: i32 = 0;
        ${this.offsetsShaderPart}

        if (useTrilinearInterpolation) {
          // for 3d luts
          // not implemented, throw error?
        } else if (useBilinearInterpolation) {
          // for single-layer luts
          value = interpolateLUTbilinear(uv, zOffset);
        } else if (useLinearInterpolation) {
          // for single-line luts
          // not implemented, throw error?
        }

        return value;
      }
    `;
  }
}
