import { Vector2, Vector3, Vector4 } from 'three';

export class HaltonSampler {
  private s: number = 0;

  constructor() {}

  reset() {
    this.s = 0;
  }

  get2DSample(): Vector2 {
    let x = this.getSample(this.s, 2);
    let y = this.getSample(this.s, 3);

    this.s++;

    return new Vector2(x, y);
  }

  get3DSample(): Vector3 {
    let x = this.getSample(this.s, 2);
    let y = this.getSample(this.s, 3);
    let z = this.getSample(this.s, 5);

    this.s++;

    return new Vector3(x, y, z);
  }

  get4DSample(): Vector4 {
    let x = this.getSample(this.s, 2);
    let y = this.getSample(this.s, 3);
    let z = this.getSample(this.s, 5);
    let w = this.getSample(this.s, 7);

    this.s++;

    return new Vector4(x, y, z, w);
  }

  getSamples(count: number): number[] {
    if (count > 8) {
      throw new Error('adjust the getSamples function to take in more than 8 samples');
    }

    let samples = [];
    let primes = [2, 3, 5, 7, 11, 13, 17, 19];
    for (let i = 0; i < count; i++) {
      samples.push(this.getSample(this.s, primes[i]));
    }
    this.s++;

    return samples;
  }

  private getSample(index: number, base: number) {
    var result = 0;
    var f = 1 / base;
    var i = index;
    while (i > 0) {
      result = result + f * (i % base);
      i = Math.floor(i / base);
      f = f / base;
    }
    return result;
  }
}
