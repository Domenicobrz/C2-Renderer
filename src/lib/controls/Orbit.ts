import { EventHandler } from '$lib/eventHandler';
import { Vector3, Matrix4 } from 'three';

export class Orbit {
  public e: EventHandler;

  public fov: number;
  public position: Vector3;
  public target: Vector3;
  public rotationMatrix: Matrix4;

  constructor() {
    this.e = new EventHandler();
    this.position = new Vector3(0, 0, -10);
    this.target = new Vector3(0, 0, 0);
    this.rotationMatrix = new Matrix4().identity();
    this.fov = Math.PI * 0.25;
  }

  set(position: Vector3, target: Vector3) {
    this.position = position;
    this.target = target;

    this.#calculateMatrix();
  }

  #calculateMatrix() {
    const dir = this.target.clone().sub(this.position).normalize();
    const up = new Vector3(0, 1, 0);
    const right = new Vector3(1, 0, 0);

    if (Math.abs(dir.dot(up)) < 0.95) {
      const basisZ = dir;
      const basisX = up.clone().cross(basisZ).normalize();
      const basisY = basisZ.clone().cross(basisX).normalize();
      this.rotationMatrix = new Matrix4().makeBasis(basisX, basisY, basisZ);
    } else {
      const basisZ = dir;
      const basisY = basisZ.clone().cross(right).normalize();
      const basisX = basisY.clone().cross(basisZ).normalize();
      this.rotationMatrix = new Matrix4().makeBasis(basisX, basisY, basisZ);
    }

    this.e.fireEvent('change');
  }
}
