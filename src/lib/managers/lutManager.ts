import { loadArrayBuffer } from '$lib/utils/loadArrayBuffer';

export enum LUTtype {
  MultiScatterTorranceSparrow,
  MultiScatterDielectric
}
let lutTypeShaderPart = /* wgsl */ `
  const LUT_MultiScatterTorranceSparrow = 0;
  const LUT_MultiScatterDielectric = 1;
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
          discreteUvs.z += ${this.zOffsetPointer};
        }
      `;
    }

    this.zOffsetPointer += sizeZ;

    this.storeLUTdata(sizeX, sizeY, sizeZ, channels, data);
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

      fn getLUTvalue(uv: vec3f, lutType: u32) -> vec4f {
        var discreteUvs = vec3u(
          u32(uv.x * 31.999),
          u32(uv.y * 31.999),
          u32(uv.z * 31.999),
        );

        ${this.offsetsShaderPart}

        let value = textureLoad(lut32, discreteUvs, 0);
        return value;
      }
    `;
  }
}
