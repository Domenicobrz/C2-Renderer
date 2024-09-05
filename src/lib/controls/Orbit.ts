import { Vector3, Matrix4, Vector2 } from 'three';
import { Camera } from './Camera';

export class Orbit extends Camera {
  public target: Vector3;

  private keys: Record<string, boolean> = {};
  private disposed: boolean;

  private rotationChange = false;
  private movementChange = false;
  private isPointerDown = false;
  private pointerDownCoords = new Vector2(-1, -1);

  private theta: number;
  private phi: number;

  constructor() {
    super();

    this.target = new Vector3(0, 0, 0);

    this.theta = Math.PI * 0.5;
    this.phi = 0.0;
    this.disposed = false;

    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));

    this.loop();
  }

  setCanvasContainer(canvasContainer: HTMLDivElement): void {
    super.setCanvasContainer(canvasContainer);

    canvasContainer.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    canvasContainer.addEventListener('pointerup', this.handlePointerUp.bind(this));
    canvasContainer.addEventListener('pointermove', this.handlePointerMove.bind(this));
  }

  dispose() {
    super.dispose();
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    window.removeEventListener('keyup', this.handleKeyUp.bind(this));
    this.canvasContainerEl.removeEventListener('pointerdown', this.handlePointerDown.bind(this));
    this.canvasContainerEl.removeEventListener('pointerup', this.handlePointerUp.bind(this));
    this.canvasContainerEl.removeEventListener('pointermove', this.handlePointerMove.bind(this));
    this.disposed = true;
  }

  private loop() {
    const epsilon = 0.001;
    if (this.theta < epsilon) this.theta = epsilon;
    if (this.theta > Math.PI - epsilon) this.theta = Math.PI - epsilon;

    let shiftActive = false;
    if (this.keys['shift']) {
      shiftActive = true;
    }

    // handle rotations first
    if (this.rotationChange) {
      const w = new Vector3(0, 1, 0);
      w.applyAxisAngle(new Vector3(-1, 0, 0), this.theta);
      w.applyAxisAngle(new Vector3(0, 1, 0), this.phi);

      const radius = this.position.clone().sub(this.target).length();
      const newPos = this.target.clone().add(w.clone().multiplyScalar(radius));
      this.position.copy(newPos);
    }

    let { basisX, basisY, basisZ } = this.getBasis();
    let msm = shiftActive ? 0.1 : 1;

    if (this.keys['w']) {
      let d = basisZ.clone().multiplyScalar(this.movementSpeed * msm);
      this.target.add(d);
      this.position.add(d);
      this.movementChange = true;
    }
    if (this.keys['s']) {
      let d = basisZ.clone().multiplyScalar(-this.movementSpeed * msm);
      this.target.add(d);
      this.position.add(d);
      this.movementChange = true;
    }
    if (this.keys['d']) {
      let d = basisX.clone().multiplyScalar(this.movementSpeed * 0.7 * msm);
      this.target.add(d);
      this.position.add(d);
      this.movementChange = true;
    }
    if (this.keys['a']) {
      let d = basisX.clone().multiplyScalar(-this.movementSpeed * 0.7 * msm);
      this.target.add(d);
      this.position.add(d);
      this.movementChange = true;
    }
    if (this.keys['q']) {
      let d = basisY.clone().multiplyScalar(this.movementSpeed * 0.3 * msm);
      this.target.add(d);
      this.position.add(d);
      this.movementChange = true;
    }
    if (this.keys['e']) {
      let d = basisY.clone().multiplyScalar(-this.movementSpeed * 0.3 * msm);
      this.target.add(d);
      this.position.add(d);
      this.movementChange = true;
    }

    if (this.rotationChange || this.movementChange) {
      this.calculateMatrix();
      this.e.fireEvent('change');
      this.rotationChange = false;
      this.movementChange = false;
    }

    if (!this.disposed) {
      requestAnimationFrame(this.loop.bind(this));
    }
  }

  private handlePointerDown(e: PointerEvent) {
    if (!this.canvasContainerEl) return;

    this.isPointerDown = true;
    this.pointerDownCoords = new Vector2(
      // both divided by clientHeight, to preserve AR
      e.clientX / this.canvasContainerEl.clientHeight,
      e.clientY / this.canvasContainerEl.clientHeight
    );
  }
  private handlePointerUp(e: PointerEvent) {
    this.isPointerDown = false;
  }
  private handlePointerMove(e: PointerEvent) {
    if (!this.isPointerDown) return;

    let currCoords = new Vector2(
      // both divided by clientHeight, to preserve AR
      e.clientX / this.canvasContainerEl.clientHeight,
      e.clientY / this.canvasContainerEl.clientHeight
    );
    let delta = currCoords.clone().sub(this.pointerDownCoords);
    if (delta.x == 0 && delta.y == 0) return;

    let rm = 1;
    if (this.keys['shift']) {
      rm = 0.1;
    }

    this.theta += -delta.y * this.rotationSpeed * 5 * rm;
    this.phi += delta.x * this.rotationSpeed * 5 * rm;
    this.rotationChange = true;

    this.pointerDownCoords = currCoords;
  }

  private handleKeyDown(e: KeyboardEvent) {
    this.keys[e.key.toLowerCase()] = true;
  }

  private handleKeyUp(e: KeyboardEvent) {
    this.keys[e.key.toLowerCase()] = false;
  }

  set(position: Vector3, target: Vector3) {
    this.position = position;
    this.target = target;

    this.calculateMatrix();
    this.e.fireEvent('change');
  }

  private getBasis(): { basisX: Vector3; basisY: Vector3; basisZ: Vector3 } {
    const dir = this.target.clone().sub(this.position).normalize();
    const up = new Vector3(0, 1, 0);

    // there's no need to check the dot since we're applying a small epsilon to theta
    // const right = new Vector3(1, 0, 0);
    // if (Math.abs(dir.dot(up)) < 0.95) {

    const basisZ = dir;
    const basisX = up.clone().cross(basisZ).normalize();
    const basisY = basisZ.clone().cross(basisX).normalize();
    return { basisX, basisY, basisZ };
  }

  private calculateMatrix() {
    let { basisX, basisY, basisZ } = this.getBasis();

    this.rotationMatrix = new Matrix4().makeBasis(basisX, basisY, basisZ);
  }
}
