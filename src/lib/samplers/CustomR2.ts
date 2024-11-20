import random, { RNG } from 'random';
import { R2Sampler } from './R2';

// from:
// https://extremelearning.com.au/unreasonable-effectiveness-of-quasirandom-sequences/
export class CustomR2Sampler {
  private seedString: string;

  private r2_2 = new R2Sampler(2);
  private r2_4 = new R2Sampler(4);
  private r2_6 = new R2Sampler(6);
  private r2_8 = new R2Sampler(8);
  private r2_10 = new R2Sampler(10);
  private r2_12 = new R2Sampler(12);
  private r2_14 = new R2Sampler(14);

  constructor(seedString: string = 'seed-string') {
    this.seedString = seedString;
    this.reset();
  }

  reset() {
    random.use(this.seedString as unknown as RNG);
    this.r2_2.reset();
    this.r2_4.reset();
    this.r2_6.reset();
    this.r2_8.reset();
    this.r2_10.reset();
    this.r2_12.reset();
    this.r2_14.reset();
  }

  // unused, it seems that this technique wont be better than the one I'm already using
  transformPair(x: number, y: number, i: number) {
    let theta = i * (Math.PI / 2);
    let translation = 0.25 * i;

    let xi = x * Math.cos(theta) - y * Math.sin(theta);
    let yi = x * Math.sin(theta) + y * Math.cos(theta);

    xi += translation;
    yi += translation;

    return [xi % 1, yi % 1];
  }

  // unused, it seems that this technique wont be better than the one I'm already using
  transformSamples(samples: number[], iter: number) {
    let newSamples = [];
    for (let i = 0; i < samples.length / 2; i++) {
      let x = samples[i * 2 + 0];
      let y = samples[i * 2 + 1];
      newSamples.push(...this.transformPair(x, y, iter));
    }
    return newSamples;
  }

  getSamples(count: number): number[] {
    let samples: number[] = [];

    samples.push(...this.r2_2.getSamples(2));
    samples.push(...this.r2_4.getSamples(4));
    samples.push(...this.r2_6.getSamples(6));
    samples.push(...this.r2_8.getSamples(8));
    samples.push(...this.r2_10.getSamples(10));
    samples.push(...this.r2_12.getSamples(12));
    samples.push(...this.r2_14.getSamples(14));

    if (samples.length > count) {
      samples = samples.slice(0, count);
    } else {
      let remaining = count - samples.length;
      for (let i = 0; i < remaining; i++) {
        samples.push(random.float());
      }
    }

    return samples;
  }
}
