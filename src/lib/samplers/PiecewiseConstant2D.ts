import { Vector2 } from 'three';
import { PC1D } from './PiecewiseConstant1D';
import type { AABB } from '$lib/bvh/aabb';
import { boundsOffset2D, clamp } from '$lib/utils/math';

export type PC2DData = {
  pConditionalV: PC1D[];
  pMarginal: PC1D;
  domain: AABB;
};

export class PC2D {
  public pConditionalV: PC1D[];
  public pMarginal: PC1D;
  public domain: AABB;

  constructor(func: number[][], nu: number, nv: number, domain: AABB) {
    let linearMemoryFunc: number[] = func.flat(1);

    let pConditionalV: PC1D[] = [];
    let pMarginal: PC1D;

    for (let v = 0; v < nv; v++) {
      pConditionalV.push(
        new PC1D(linearMemoryFunc.slice(v * nu, v * nu + nu), domain.min.x, domain.max.x)
      );
    }

    let marginalFunc: number[] = [];
    for (let v = 0; v < nv; ++v) {
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
}
