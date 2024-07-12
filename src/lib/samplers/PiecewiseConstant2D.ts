import { Vector2 } from 'three';
import { PC1D } from './PiecewiseConstant1D';
import type { AABB } from '$lib/bvh/aabb';
import { boundsOffset2D, clamp } from '$lib/utils/math';

export class PC2D {
  public pConditionalV: PC1D[];
  public pMarginal: PC1D;
  public domain: AABB;

  private sizeX: number;
  private sizeY: number;

  constructor(func: number[][], sizeX: number, sizeY: number, domain: AABB) {
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

  getBufferData(): { data: ArrayBuffer; byteSize: number } {
    // https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#x=5d000001003101000000000000003d888b0237284d3025f2381bcb2887abe1236818644f249d16ed6665cfb955d23da18f40361a9e1d6ae3abfa5c43c12bc70f6bedab5ce52ffedd28fbcbaca3cbbfd5fae5aac907fa22e4a51bb43c003a15c31f3d39f5b8d5995a5022db6de4969eefbf1f24b4ddeba4c5fc4cb41d477965ff14ec9bc8b80909b9967623dcf52cc800d8525d2a2c331bad2d7aef1aedb977e9815de36c57021ff9c2d12d
    // (3 + this.sizeX * 3 + 1) === min,max,funcint + func[] + absFunc[] + cdf[] --- the +1 at the end
    // is the cdf being one element larger than the other arrays
    // (this.sizeY + 1)     === pConditionalV: PC1D[] + pMarginal: PC1D
    let pc1dElementsCount = (3 + this.sizeX * 3 + 1) * (this.sizeY + 1);
    let pc1dElementsBytesCount = pc1dElementsCount * 4;

    let totalByteSize = 40 + pc1dElementsBytesCount + 2 * 4; // 2 * 4 is the padding

    const PC2DValues = new ArrayBuffer(totalByteSize);
    const PC2DViews = {
      domain: {
        min: new Float32Array(PC2DValues, 0, 3),
        max: new Float32Array(PC2DValues, 16, 3)
      },
      size: new Int32Array(PC2DValues, 32, 2),
      // the +2 at the end is the padding computed by offset computer,
      // strangely, it's always two, no matter what's the elements count
      data: new Float32Array(PC2DValues, 40, pc1dElementsCount + 2)
    };

    PC2DViews.domain.min.set([this.domain.min.x, this.domain.min.y, 0]);
    PC2DViews.domain.max.set([this.domain.max.x, this.domain.max.y, 0]);
    PC2DViews.size.set([this.sizeX, this.sizeY]);

    let pc1dElements = [];
    this.pConditionalV.forEach((pc1d) => {
      pc1dElements.push(
        pc1d.min,
        pc1d.max,
        pc1d.funcInt,
        ...pc1d.func,
        ...pc1d.absFunc,
        ...pc1d.cdf
      );
    });
    pc1dElements.push(
      this.pMarginal.min,
      this.pMarginal.max,
      this.pMarginal.funcInt,
      ...this.pMarginal.func,
      ...this.pMarginal.absFunc,
      ...this.pMarginal.cdf
    );
    pc1dElements.push(0, 0); // +2 padding, read above
    PC2DViews.data.set(pc1dElements);

    return {
      data: PC2DValues,
      byteSize: totalByteSize
    };
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct PC2D {
        domain: AABB,
        size: vec2i,
        // data will contain:
        // pConditionalV: PC1D[];
        // pMarginal: PC1D;
        // - - - - - - - -  
        // PC1D will be held in memory with this layout:
        // min, max, funcInt, func[], absFunc[], cdf[]
        data: array<f32>,
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
        data: ptr<storage, array<f32>>, size: vec2i, domain: AABB, uv: vec2f
      ) -> PC2DSample {
        // 3 struct elements, min max & funcInt, then size.x * 3 for the arrays, but remember, 
        // cdf has an additional element, so we add +1
        // and then we multiply by size.y
        let pMarginalDataOffset = (3 + size.x * 3 + 1) * size.y;
        let pMarginalSize = size.y;

        var offset = vec2i(-1, -1);
        let pMarginalSample = samplePC1D(data, pMarginalDataOffset, pMarginalSize, uv.y);
        offset.y = pMarginalSample.offset;
        
        let pConditionalVDataOffset = (3 + size.x * 3 + 1) * offset.y;
        let pConditionalSize = size.x;
        let pConditionalVSample = samplePC1D(data, pConditionalVDataOffset, pConditionalSize, uv.x);
        offset.x = pConditionalVSample.offset;

        return PC2DSample(
          offset,
          pMarginalSample.pdf * pConditionalVSample.pdf,
          vec2f(pConditionalVSample.remappedOffset, pMarginalSample.remappedOffset)
        );
      }
    `;
  }
}
