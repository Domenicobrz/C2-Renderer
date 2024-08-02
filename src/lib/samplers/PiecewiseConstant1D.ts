import { lerp } from '$lib/utils/math';

export class PC1D {
  public func: number[] = [];
  public absFunc: number[] = [];
  public cdf: number[] = [];
  public min: number = -1;
  public max: number = -1;
  public funcInt: number = -1;

  constructor(func: number[], min?: number, max?: number);
  constructor(func: ArrayBuffer);
  constructor(func: number[] | ArrayBuffer, min?: number, max?: number) {
    if (func instanceof ArrayBuffer) {
      this.fromBufferData(func);
      return;
    }

    if (min === undefined || max === undefined) {
      throw new Error('PC1D constructor must provide min and max values');
    }

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

  fromBufferData(data: ArrayBuffer) {
    // order is: min, max, funcint, func, absfunc, cdf
    let byteLength = data.byteLength;
    let elementsCount = byteLength / 4;
    let funcArrayElementsCount = Math.floor((elementsCount - 3) / 3);
    let fa = new Float32Array(data, 0, elementsCount);

    this.min = fa[0];
    this.max = fa[1];
    this.funcInt = fa[2];
    this.func = Array.from(fa.slice(3, 3 + funcArrayElementsCount));
    this.absFunc = Array.from(fa.slice(3 + funcArrayElementsCount, 3 + funcArrayElementsCount * 2));
    this.cdf = Array.from(
      fa.slice(3 + funcArrayElementsCount * 2, 3 + funcArrayElementsCount * 3 + 1)
    );
  }

  getBufferData(): ArrayBuffer {
    const byteLength = 3 * 4 + (this.func.length * 3 + 1) * 4;
    const data = new ArrayBuffer(byteLength);
    let elementsCount = byteLength / 4;
    let funcSize = this.func.length;

    let bufferView = new Float32Array(data, 0, elementsCount);
    bufferView[0] = this.min;
    bufferView[1] = this.max;
    bufferView[2] = this.funcInt;

    for (let i = 0; i < this.func.length; i++) {
      bufferView[3 + i] = this.func[i];
    }
    for (let i = 0; i < this.absFunc.length; i++) {
      bufferView[3 + funcSize + i] = this.absFunc[i];
    }
    for (let i = 0; i < this.cdf.length; i++) {
      bufferView[3 + funcSize * 2 + i] = this.cdf[i];
    }

    return data;
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

  samplePC1D(u: number) {
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

  static shaderStruct(): string {
    return /* wgsl */ `
      struct PC1DSample {
        offset: i32,
        pdf: f32,
        remappedOffset: f32,
        sampledValue: f32,
      }
    `;
  }

  static shaderMethods(): string {
    return /* wgsl */ `

      // we have to be careful with the find function, the cdf could be of this type:
      // [0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.6, 1.0]
      // in this case with u = 0.1, I can't sample any of the 0.1s in the middle of the array,
      // since they would all have probability 0 of being taken, thus:
      //   "the function must return the offset into the array of function values of the 
      //   largest index where the CDF was less than or equal to u. 
      //   (In other words, cdf[offset] <= u < cdf[offset+1])"
      // using the array above as example, if u = 0.09, then the offset is: idx=0, 
      // if u = 0.1, then idx=6, (notice we skipped all the ones in the middle)
      // if u = 0.11, then we still have idx=6
      // ******** another important point ********
      // I think the algo could fail if u=1.0, I had to clamp my rands to 0.9999999
      // I'm not entirely sure wheter that's a problem or not, it would be worth testing
      fn PC1D_FindCDFIndex(data: ptr<storage, array<f32>>, offset: i32, sz: i32, u: f32) -> i32 {
        var size = sz - 2; 
        var first = offset + 1;

        while (size > 0) {
          let half = size >> 1; 
      	  let middle = first + half;
          let predResult = data[middle] <= u;

          if (predResult) {
            first = middle + 1;
            size = size - (half + 1);
          } else {
            first = first;
            size = half;
          }
        }

        // clamp between 0 and size - 2 (note that we need to add offset to both)
        return clamp(first - 1, offset + 0, offset + sz - 2);
      }

      fn samplePC1D(
        data: ptr<storage, array<f32>>, offset: i32, size: i32, u: f32
      ) -> PC1DSample {
        // this function is unfortunately somewhat complicated given that "data"
        // contains an entire structure with multiple arrays, the CPU version 
        // that is much easier to read is contained inside PiecewiseConstant1D.ts

        let min = data[offset + 0];
        let max = data[offset + 1];
        let funcInt = data[offset + 2];

        let func_data_idx = offset + 3;
        let absFunc_data_idx = offset + 3 + size;
        let cdf_data_idx = offset + 3 + size * 2;

        let cdf_o = PC1D_FindCDFIndex(data, cdf_data_idx, size, u);
        let relative_o = cdf_o - cdf_data_idx;

        // // e.g. u == 0.7 and cdf[o] == 0.68
        var du = u - data[cdf_o];
        if (data[cdf_o + 1] - data[cdf_o] > 0) {
          // after that du will be in range [0...1]
          du /= data[cdf_o + 1] - data[cdf_o];
        }

        let funcValueAtO = data[func_data_idx + relative_o];
        let absFuncValueAtO = data[absFunc_data_idx + relative_o];
    
        let offs = relative_o;
        var pdf: f32 = 0;
        if (funcInt > 0) {
          pdf = absFuncValueAtO / funcInt; 
        } else {
          pdf = 0;
        }
        let remappedOffset = Lerp((f32(relative_o) + du) / f32(size), min, max);
        let sampledValue = funcValueAtO;
    
        return PC1DSample(offs, pdf, remappedOffset, sampledValue);
      }    
    `;
  }
}
