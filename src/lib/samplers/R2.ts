import random, { RNG } from 'random';

// from:
// https://extremelearning.com.au/unreasonable-effectiveness-of-quasirandom-sequences/
export class R2Sampler {
  private seedString: string;

  private as: number[];
  private numberOfDimensions: number;
  private phi: number;
  private iteration: number = 0;

  constructor(dimensions: number, seedString: string = 'seed-string') {
    this.seedString = seedString;
    this.reset();

    this.numberOfDimensions = dimensions;
    this.phi = this.calculatePhi(this.numberOfDimensions);
    this.as = this.calculateAs(this.phi, this.numberOfDimensions);
  }

  calculatePhi(d: number, precision = 50) {
    let x = 2;
    for (let i = 0; i < precision; i++) {
      x = Math.pow(1 + x, 1 / (d + 1));
    }
    return x;
  }

  calculateAs(phi: number, numberOfDimensions: number) {
    let as = [];
    for (let i = 0; i < numberOfDimensions; i++) {
      as.push(1 / Math.pow(phi, i + 1));
    }
    return as;
  }

  getSample(d: number, n: number) {
    let value = 0.5 + this.as[d] * n;
    return value % 1;
  }

  reset() {
    random.use(this.seedString as unknown as RNG);
    this.iteration = 0;
  }

  getSamples(count: number): number[] {
    let samples = [];
    for (let i = 0; i < count; i++) {
      if (i < this.numberOfDimensions) {
        let s = this.getSample(i, this.iteration);
        samples.push(s);
      } else {
        samples.push(random.float());
      }
    }
    this.iteration++;
    return samples;
  }
}
