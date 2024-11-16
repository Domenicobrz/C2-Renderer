import random, { RNG } from 'random';

function ToroidalDistanceSquared(x1: number, y1: number, x2: number, y2: number) {
  let dx = Math.abs(x2 - x1);
  let dy = Math.abs(y2 - y1);

  if (dx > 0.5) {
    dx = 1.0 - dx;
  }
  if (dy > 0.5) {
    dy = 1.0 - dy;
  }

  return dx * dx + dy * dy;
}

// TODO: can be improved with:
// https://blog.demofox.org/2023/03/15/eulers-best-candidate-for-generating-blue-noise-sample-points-and-more/
export class BlueNoiseSampler {
  private seedString: string;

  public points: number[][][];

  constructor(seedString: string = 'seed-string') {
    this.seedString = seedString;
    this.points = [];
    this.reset();
  }

  randomPoint() {
    return [random.float(), random.float()];
  }

  addSample(dim: number) {
    if (!this.points[dim]) this.points[dim] = [];

    if (this.points[dim].length == 0) {
      this.points[dim].push(this.randomPoint());
      return;
    }

    let candidates = [];
    let N = this.points[dim].length;
    for (let j = 0; j < N; j++) {
      candidates.push(this.randomPoint());
    }

    let furthestDistance = 0;
    let bestCandidateIndex = -1;
    candidates.forEach((c, ci) => {
      let closestDistance = Infinity;
      this.points[dim].forEach((p, _) => {
        let tdist = ToroidalDistanceSquared(c[0], c[1], p[0], p[1]);
        if (tdist < closestDistance) {
          closestDistance = tdist;
        }
      });

      if (closestDistance > furthestDistance) {
        furthestDistance = closestDistance;
        bestCandidateIndex = ci;
      }
    });

    this.points[dim].push(candidates[bestCandidateIndex]);
  }

  resetArrays() {
    this.points = [];
  }

  reset() {
    random.use(this.seedString as unknown as RNG);
    this.resetArrays();
  }

  getSamples(count: number, limit: number = 200): number[] {
    if (count % 2 !== 0) {
      throw new Error('Blue noise requires an even number of samples');
    }

    // if we have more than limit points, we'll reset the arrays and start from scratch
    // this will, effectively, re-create another bluenoise distribution "on top" of the
    // old one, which is wrong but is better than generating more points past 200
    // since it would become excessively expensive
    // TODO: an alternative would be to precompute a long set of samples and use those
    if (this.points[0] && this.points[0].length > limit) {
      this.resetArrays();
    }

    let samples = [];
    for (let dim = 0; dim < count / 2; dim++) {
      // let's add a blue-noise sample to our points array
      this.addSample(dim);

      let x = this.points[dim][this.points[0].length - 1][0];
      let y = this.points[dim][this.points[0].length - 1][1];

      samples.push(x, y);
    }

    return samples;
  }
}
