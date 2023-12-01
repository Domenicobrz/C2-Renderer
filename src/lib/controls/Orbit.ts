import { EventHandler } from '$lib/eventHandler';
import { Vector3, Matrix4 } from 'three';

export class Orbit {
  public e: EventHandler;

  public fov: number;
  public position: Vector3;
  public target: Vector3;
  public rotationMatrix: Matrix4;

  #keys: { a: boolean; s: boolean; d: boolean; w: boolean };
  #disposed: boolean;

  #theta: number;
  #phi: number;

  constructor() {
    this.e = new EventHandler();
    this.position = new Vector3(0, 0, -10);
    this.target = new Vector3(0, 0, 0);
    this.rotationMatrix = new Matrix4().identity();
    this.fov = Math.PI * 0.25;

    this.#theta = Math.PI * 0.5;
    this.#phi = 0.0;

    this.#keys = {
      a: false,
      s: false,
      d: false,
      w: false
    };
    this.#disposed = false;

    window.addEventListener('keydown', this.#handleKeyDown.bind(this));
    window.addEventListener('keyup', this.#handleKeyUp.bind(this));

    this.#loop();
  }

  dispose() {
    window.removeEventListener('keydown', this.#handleKeyDown.bind(this));
    window.removeEventListener('keyup', this.#handleKeyUp.bind(this));
    this.#disposed = true;
  }

  #loop() {
    if (this.#keys['w']) this.#theta += 0.05;
    if (this.#keys['s']) this.#theta -= 0.05;
    if (this.#keys['d']) this.#phi += 0.05;
    if (this.#keys['a']) this.#phi -= 0.05;

    const epsilon = 0.001;
    if (this.#theta < epsilon) this.#theta = epsilon;
    if (this.#theta > Math.PI - epsilon) this.#theta = Math.PI - epsilon;

    if (this.#keys['w'] || this.#keys['s'] || this.#keys['d'] || this.#keys['a']) {
      const dirV = new Vector3(0, 1, 0);
      dirV.applyAxisAngle(new Vector3(-1, 0, 0), this.#theta);
      dirV.applyAxisAngle(new Vector3(0, 1, 0), this.#phi);

      const radius = this.position.clone().sub(this.target).length();
      const newPos = this.target.clone().add(dirV.clone().multiplyScalar(radius));

      this.position.copy(newPos);

      this.#calculateMatrix();
      this.e.fireEvent('change');
    }

    if (!this.#disposed) {
      requestAnimationFrame(this.#loop.bind(this));
    }
  }

  #handleKeyDown(e: KeyboardEvent) {
    if (e.key == 'w' || e.key == 'a' || e.key == 's' || e.key == 'd') {
      this.#keys[e.key] = true;
    }
  }

  #handleKeyUp(e: KeyboardEvent) {
    if (e.key == 'w' || e.key == 'a' || e.key == 's' || e.key == 'd') {
      this.#keys[e.key] = false;
    }
  }

  set(position: Vector3, target: Vector3) {
    this.position = position;
    this.target = target;

    this.#calculateMatrix();
    this.e.fireEvent('change');
  }

  #getBasis(): { basisX: Vector3; basisY: Vector3; basisZ: Vector3 } {
    const dir = this.target.clone().sub(this.position).normalize();
    const up = new Vector3(0, 1, 0);

    // there's no need to check the dot since we're applying a small epsilon to #theta
    // const right = new Vector3(1, 0, 0);
    // if (Math.abs(dir.dot(up)) < 0.95) {

    const basisZ = dir;
    const basisX = up.clone().cross(basisZ).normalize();
    const basisY = basisZ.clone().cross(basisX).normalize();
    return { basisX, basisY, basisZ };
  }

  #calculateMatrix() {
    let { basisX, basisY, basisZ } = this.#getBasis();

    this.rotationMatrix = new Matrix4().makeBasis(basisX, basisY, basisZ);
  }
}
