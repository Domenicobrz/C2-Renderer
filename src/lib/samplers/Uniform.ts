import random, { RNG } from 'random';

export class UniformSampler {
  private seedString: string;

  constructor(seedString: string = 'seed-string') {
    this.seedString = seedString;
    this.reset();
  }

  reset() {
    random.use(this.seedString as unknown as RNG);
  }

  getSamples(count: number): number[] {
    let samples = [];
    for (let i = 0; i < count; i++) {
      samples.push(random.float());
    }
    return samples;
  }
}
