import { Vector2 } from 'three';
import { pc1dConstruct, samplePC1D, type PC1D } from './PiecewiseConstant1D';
import type { AABB } from '$lib/bvh/aabb';

export type PC2D = {
  pConditionalV: PC1D[];
  pMarginal: PC1D;
  domain: AABB;
};

export function pc2dConstruct(func: number[][], nu: number, nv: number, domain: AABB) {
  let linearMemoryFunc: number[] = func.flat(1);

  let pConditionalV: PC1D[] = [];
  let pMarginal: PC1D;

  for (let v = 0; v < nv; v++) {
    pConditionalV.push(
      pc1dConstruct(linearMemoryFunc.slice(v * nu, v * nu + nu), domain.min.x, domain.max.x)
    );
  }

  let marginalFunc: number[] = [];
  for (let v = 0; v < nv; ++v) {
    marginalFunc.push(pConditionalV[v].funcInt);
  }
  pMarginal = pc1dConstruct(marginalFunc, domain.min.y, domain.max.y);

  return {
    pConditionalV,
    pMarginal,
    domain
  };
}

export function samplePC2D(struct: PC2D, u: Vector2) {
  let offset = new Vector2(-1, -1);
  let pMarginalSample = samplePC1D(struct.pMarginal, u.y);
  offset.y = pMarginalSample.offset;
  let pConditionalVSample = samplePC1D(struct.pConditionalV[offset.y], u.x);
  offset.x = pConditionalVSample.offset;

  return {
    pdf: pMarginalSample.pdf * pConditionalVSample.pdf,
    offset,
    floatOffset: new Vector2(pConditionalVSample.remappedOffset, pMarginalSample.remappedOffset)
  };
}

function BoundsOffset2D(domain: AABB, p: Vector2): Vector2 {
  let o = p.clone().sub(new Vector2(domain.min.x, domain.min.y));

  if (domain.max.x > domain.min.x) o.x /= domain.max.x - domain.min.x;
  if (domain.max.y > domain.min.y) o.y /= domain.max.y - domain.min.y;

  return o;
}

function Clamp(val: number, low: number, high: number) {
  if (val < low) return low;
  else if (val > high) return high;
  else return val;
}

// given a float offset, retrieve the pdf
function pdfPC2D(struct: PC2D, floatOffset: Vector2, domain: AABB) {
  let { pConditionalV, pMarginal } = struct;
  let p = BoundsOffset2D(domain, floatOffset);

  /* int */ let iu = Clamp(
    /* int(...) */ Math.floor(p.x * pConditionalV[0].func.length),
    0,
    pConditionalV[0].func.length - 1
  );
  /* int */ let iv = Clamp(
    /* int(...) */ Math.floor(p.y * pMarginal.func.length),
    0,
    pMarginal.func.length - 1
  );
  return pConditionalV[iv].func[iu] / pMarginal.funcInt;
}
