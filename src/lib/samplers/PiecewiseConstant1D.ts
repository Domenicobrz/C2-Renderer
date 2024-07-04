import { lerp } from '$lib/utils/math';

export type PC1DSample = {
  offset: number;
  pdf: number;
  remappedOffset: number;
  sampledValue: number;
};

export class PC1D {
  public func: number[];
  public absFunc: number[];
  public cdf: number[];
  public min: number;
  public max: number;
  public funcInt: number;

  constructor(func: number[], min: number, max: number) {
    let absFunc = [];
    let cdf = [];
    let funcInt = 0;

    // ************ javascript only, using .push ***********
    for (let i = 0; i < func.length; i++) {
      absFunc.push(0);
      cdf.push(0);
    }
    // ************ javascript only, using .push ***********

    for (let i = 0; i < func.length; i++) {
      absFunc[i] = Math.abs(func[i]);
    }

    cdf[0] = 0;
    let n = func.length;

    // we changed ++i to i++, check if cdf is computed ok
    // we changed ++i to i++, check if cdf is computed ok
    // we changed ++i to i++, check if cdf is computed ok
    // actually I'm changing all of the ++i to i++
    /*
      perchè max - min / n ?
      secondo me, è per questo:
      supponi che la funzione ha 100 elementi, ma tu vuoi remapparla in un index che va da 0 a 1000
      credo che non puoi semplicemente fare il sampling di 100 elementi, che ritorna ad esempio l'indice
      69, e moltiplicare 69 * 10 per avere l'index su un array di 1000 elementi
      perchè stai assumendo che ci sia la "stessa probabilità" in quei 10 elementi che hai creato dal nulla
      facendo quell'interpolazione lineare.
      NEVERMIND --- non sono più sicuro di questa cosa qua, perchè altrimenti che senso avrebbe
      mettere questo risultato su cdf[i] che ha come numero massimo di elementi 100 ?
      in questo caso questo (max - min) / n starebbe facendo (1000 - 0) / 100 = 10 ovvero moltiplica
      l'integrale per 10.. per quale motivo? bho
      E comunque che senso ha? alla fine dividiamo cdf[i] per funcInt ... wtf
      ------------
      FINALMENTE HO CAPITO:
      Okay I think I got it: at some point we're calculating the pdf:
      let pdf = absFunc[o] / funcInt;
  
      and then remapping the values:
      let remappedOffset = Lerp((o + du) / cdf.length, min, max);
  
      if we now have "10" entries between cdf stops (max-min is 1000 out of a func with 100 elements)
      then the pdf for each of these entries can't be the pdf defined with an integral without
      the max - min / n trick, otherwise that pdf value would be 10 times larger than it should
    */
    for (let i = 1; i < n + 1; i++) {
      cdf[i] = cdf[i - 1] + (func[i - 1] * (max - min)) / n;
    }

    funcInt = cdf[n];
    if (funcInt == 0) {
      for (let i = 1; i < n + 1; i++) {
        cdf[i] = i / n;
      }
    } else {
      for (let i = 1; i < n + 1; i++) {
        cdf[i] /= funcInt;
      }
    }

    this.func = func;
    this.min = min;
    this.max = max;
    this.absFunc = absFunc;
    this.cdf = cdf;
    this.funcInt = funcInt;
  }

  // will return the largest index whose cdf value is smaller or equal to U
  findCDFIndex(cdf: number[], u: number) {
    let si = 0;
    let ei = cdf.length;

    var mid = -2;
    var fidx = -1;

    while (fidx != mid) {
      // floor will only be necessary on javascript
      mid = Math.floor((si + ei) / 2);
      fidx = mid;

      let cdfVal = cdf[mid];

      if (u > cdfVal) {
        si = mid;
        mid = Math.floor((si + ei) / 2);
      }
      if (u < cdfVal) {
        ei = mid;
        mid = Math.floor((si + ei) / 2);
      }
    }

    return fidx;
  }

  samplePC1D(u: number): PC1DSample {
    let { cdf, absFunc, funcInt, func, min, max } = this;
    let o = this.findCDFIndex(cdf, u);

    // e.g. u == 0.7 and cdf[o] == 0.68
    let du = u - cdf[o];
    if (cdf[o + 1] - cdf[o] > 0) {
      // after that du will be in range [0...1]
      du /= cdf[o + 1] - cdf[o];
    }

    let offset = o;
    let pdf = funcInt > 0 ? absFunc[o] / funcInt : 0;
    let remappedOffset = lerp((o + du) / func.length, min, max);
    let sampledValue = func[o];

    return {
      offset,
      pdf,
      remappedOffset,
      sampledValue
    };
  }

  invertPC1D(x: number) {
    let { cdf, func, min, max } = this;
    if (x < min || x > max) {
      return;
    }

    let c = ((x - min) / (max - min)) * func.length;
    let offset = Math.min(Math.max(Math.floor(c), 0), func.length - 1);

    let delta = c - offset;
    return lerp(delta, cdf[offset], cdf[offset + 1]);
  }
}
