import { Vector2, Vector3 } from 'three';
import { PC1D } from './PiecewiseConstant1D';
import { AABB } from '$lib/bvh/aabb';
import { boundsOffset2D, clamp } from '$lib/utils/math';

export class PC2D {
  public pConditionalV: PC1D[] = [];
  public pMarginal: PC1D = new PC1D([1], 0, 1);
  public domain: AABB = new AABB();

  private sizeX: number = 0;
  private sizeY: number = 0;

  constructor(func: number[][], sizeX?: number, sizeY?: number, domain?: AABB);
  constructor(func: ArrayBuffer);
  constructor(func: number[][] | ArrayBuffer, sizeX?: number, sizeY?: number, domain?: AABB) {
    if (func instanceof ArrayBuffer) {
      this.fromArrayBuffer(func);
      return;
    }

    if (sizeX === undefined || sizeY === undefined || domain === undefined) {
      throw new Error('PC2D constructor requires size and domain');
    }

    let linearMemoryFunc: number[] = func.flat(1);

    this.sizeX = sizeX;
    this.sizeY = sizeY;

    let pConditionalV: PC1D[] = [];
    let pMarginal: PC1D;

    for (let v = 0; v < sizeY; v++) {
      pConditionalV.push(
        new PC1D(linearMemoryFunc.slice(v * sizeX, v * sizeX + sizeX), domain.min.x, domain.max.x)
      );
    }

    let marginalFunc: number[] = [];
    for (let v = 0; v < sizeY; ++v) {
      marginalFunc.push(pConditionalV[v].funcInt);
    }
    pMarginal = new PC1D(marginalFunc, domain.min.y, domain.max.y);

    this.pConditionalV = pConditionalV;
    this.pMarginal = pMarginal;
    this.domain = domain;
  }

  samplePC2D(u: Vector2) {
    let offset = new Vector2(-1, -1);
    let pMarginalSample = this.pMarginal.samplePC1D(u.y);
    offset.y = pMarginalSample.offset;
    let pConditionalVSample = this.pConditionalV[offset.y].samplePC1D(u.x);
    offset.x = pConditionalVSample.offset;

    return {
      pdf: pMarginalSample.pdf * pConditionalVSample.pdf,
      offset,
      floatOffset: new Vector2(pConditionalVSample.remappedOffset, pMarginalSample.remappedOffset)
    };
  }

  // given a float offset, retrieve the pdf
  pdfPC2D(floatOffset: Vector2, domain: AABB) {
    let { pConditionalV, pMarginal } = this;
    let p = boundsOffset2D(domain, floatOffset);

    /* int */ let iu = clamp(
      /* int(...) */ Math.floor(p.x * pConditionalV[0].func.length),
      0,
      pConditionalV[0].func.length - 1
    );
    /* int */ let iv = clamp(
      /* int(...) */ Math.floor(p.y * pMarginal.func.length),
      0,
      pMarginal.func.length - 1
    );
    return pConditionalV[iv].func[iu] / pMarginal.funcInt;
  }

  fromArrayBuffer(buffer: ArrayBuffer) {
    const PC2DValues = buffer;
    const BufferAsFloats = new Float32Array(PC2DValues);
    const BufferAsInts = new Int32Array(PC2DValues);
    this.domain = new AABB(
      new Vector3(BufferAsFloats[0], BufferAsFloats[1], BufferAsFloats[2]),
      new Vector3(BufferAsFloats[4], BufferAsFloats[5], BufferAsFloats[6])
    );
    this.sizeX = BufferAsInts[8];
    this.sizeY = BufferAsInts[9];

    // now that we know the size, we can compute the pc1ds buffer offsets
    let singlePc1dElementsCount = 3 + this.sizeX * 3 + 1;
    let singlePc1dElementsByteCount = singlePc1dElementsCount * 4;

    for (let i = 0; i < this.sizeY; i++) {
      this.pConditionalV.push(
        new PC1D(
          buffer.slice(
            40 + i * singlePc1dElementsByteCount,
            40 + (i + 1) * singlePc1dElementsByteCount
          )
        )
      );
    }
    this.pMarginal = new PC1D(
      buffer.slice(
        40 + singlePc1dElementsByteCount * this.sizeY,
        40 + singlePc1dElementsByteCount * (this.sizeY + 1)
      )
    );
  }

  getArrayData(): ArrayBuffer {
    // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001003101000000000000003d888b0237284d3025f2381bcb2887abe1236818644f249d16ed6665cfb955d23da18f40361a9e1d6ae3abfa5c43c12bc70f6bedab5ce52ffedd28fbcbaca3cbbfd5fae5aac907fa22e4a51bb43c003a15c31f3d39f5b8d5995a5022db6de4969eefbf1f24b4ddeba4c5fc4cb41d477965ff14ec9bc8b80909b9967623dcf52cc800d8525d2a2c331bad2d7aef1aedb977e9815de36c57021ff9c2d12d
    // (3 + this.sizeX * 3 + 1) === min,max,funcint + func[] + absFunc[] + cdf[] --- the +1 at the end
    // is the cdf being one element larger than the other arrays
    // (this.sizeY + 1)     === pConditionalV: PC1D[] + pMarginal: PC1D
    let singlePc1dElementsCount = 3 + this.sizeX * 3 + 1;
    let pc1dElementsCount = singlePc1dElementsCount * (this.sizeY + 1);
    let pc1dElementsBytesCount = pc1dElementsCount * 4;

    // 2 * 4 is the padding
    let totalByteSize = pc1dElementsBytesCount + 2 * 4;

    const PC2DValues = new ArrayBuffer(totalByteSize);
    const PC2DViews = {
      data: new Float32Array(PC2DValues, 0, pc1dElementsCount + 2)
    };

    this.pConditionalV.forEach((pc1d, i) => {
      let buffer = pc1d.getBufferData();
      PC2DViews.data.set(new Float32Array(buffer), singlePc1dElementsCount * i);
    });
    let marginalBuffer = this.pMarginal.getBufferData();
    PC2DViews.data.set(
      new Float32Array(marginalBuffer),
      singlePc1dElementsCount * this.pConditionalV.length
    );
    // padding
    PC2DViews.data.set([0, 0], pc1dElementsCount);

    return PC2DValues;
  }

  getBufferData(): ArrayBuffer {
    // 2 * 4 is the padding
    let totalByteSize = 48;

    const PC2DValues = new ArrayBuffer(totalByteSize);
    const PC2DViews = {
      domainmin: new Float32Array(PC2DValues, 0, 3),
      domainmax: new Float32Array(PC2DValues, 16, 3),
      size: new Int32Array(PC2DValues, 32, 2)
    };

    PC2DViews.domainmin.set([this.domain.min.x, this.domain.min.y, 0]);
    PC2DViews.domainmax.set([this.domain.max.x, this.domain.max.y, 0]);
    PC2DViews.size.set([this.sizeX, this.sizeY]);
    return PC2DValues;
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct PC2D {
        // I tried using:
        // domain: AABB, but it wasn't working on macos
        domainmin: vec3f,
        domainmax: vec3f,
        size: vec2i,
      }

      struct PC2DSample {
        offset: vec2i,
        pdf: f32,
        floatOffset: vec2f,
      }
    `;
  }

  static shaderMethods(): string {
    return /* wgsl */ `
      fn samplePC2D(
        size: vec2i, domain: AABB, uv: vec2f
      ) -> PC2DSample {
        // 3 struct elements, min max & funcInt, then size.x * 3 for the arrays, but remember, 
        // cdf has an additional element, so we add +1
        // and then we multiply by size.y
        let pMarginalDataOffset = (3 + size.x * 3 + 1) * size.y;
        let pMarginalSize = size.y;

        var offset = vec2i(-1, -1);
        let pMarginalSample = samplePC1D(pMarginalDataOffset, pMarginalSize, uv.y);
        offset.y = pMarginalSample.offset;
        
        let pConditionalVDataOffset = (3 + size.x * 3 + 1) * offset.y;
        let pConditionalSize = size.x;
        let pConditionalVSample = samplePC1D(pConditionalVDataOffset, pConditionalSize, uv.x);
        offset.x = pConditionalVSample.offset;
      
        return PC2DSample(
          offset,
          pMarginalSample.pdf * pConditionalVSample.pdf,
          vec2f(pConditionalVSample.remappedOffset, pMarginalSample.remappedOffset)
        );
      }

      fn getPC2Dpdf(size: vec2i, floatOffset: vec2f, domain: AABB) -> f32 {
        let p = boundsOffset2D(domain, floatOffset);

        let iu: i32 = clamp(
          i32(p.x * f32(size.x)),
          0,
          size.x - 1
        );
        let iv: i32 = clamp(
          i32(p.y * f32(size.y)),
          0,
          size.y - 1
        );

        let pMarginalDataOffset = (3 + size.x * 3 + 1) * size.y;
        let pMarginalFuncInt = envmapPC2Darray[pMarginalDataOffset + 2];

        let pConditionalVDataOffset = (3 + size.x * 3 + 1) * iv;
        let pConditionalV_func_iu_value = envmapPC2Darray[
          pConditionalVDataOffset + 3 + iu
        ];
        
        return pConditionalV_func_iu_value / pMarginalFuncInt;
      }
    `;
  }
}
