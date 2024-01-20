import { Vector2 } from 'three';

export class HaltonSampler {
  #s: number = 0;

  constructor() {}

  reset() {
    this.#s = 0;
  }

  get2DSample(): Vector2 {
    let x = this.#getSample(this.#s, 2);
    let y = this.#getSample(this.#s, 3);

    this.#s++;

    return new Vector2(x, y);
  }

  #getSample(index: number, base: number) {
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