import { Vector2 } from 'three';

export type Tile = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export class TileSequence {
  #canvasSize: Vector2 = new Vector2(0, 0);
  #tile: Tile = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {}

  setCanvasSize(canvasSize: Vector2) {
    this.#canvasSize = canvasSize;
    this.resetTile();
  }

  canTileSizeBeIncreased() {
    if (this.#tile.w < this.#canvasSize.x || this.#tile.h < this.#canvasSize.y) return true;
    return false;
  }

  increaseTileSizeAndResetPosition() {
    this.#tile.w *= 2;
    this.#tile.h *= 2;
    // by setting the tile position to the maximum values,
    // getNextTile() will pick the initial position as the next tile
    this.#tile.x = this.#canvasSize.x;
    this.#tile.y = this.#canvasSize.y;

    if (this.#tile.w > this.#canvasSize.x) {
      this.#tile.w = this.#canvasSize.x;
      this.#tile.w = Math.ceil(this.#tile.w / 8) * 8;
    }
    if (this.#tile.h > this.#canvasSize.y) {
      this.#tile.h = this.#canvasSize.y;
      this.#tile.h = Math.ceil(this.#tile.h / 8) * 8;
    }
  }

  resetTile() {
    // we decided tilesize will be a multiple of 8
    this.#tile = { x: this.#canvasSize.x, y: this.#canvasSize.y, w: 16, h: 16 };
  }

  getNextTile(onTileStart: () => void) {
    this.#tile.x += this.#tile.w;

    if (this.#tile.x >= this.#canvasSize.x) {
      this.#tile.x = 0;
      this.#tile.y += this.#tile.h;
    }

    if (this.#tile.y >= this.#canvasSize.y) {
      this.#tile.x = 0;
      this.#tile.y = 0;
      onTileStart();
    }

    return this.#tile;
  }

  getWorkGroupCount() {
    return new Vector2(this.#tile.w / 8, this.#tile.h / 8);
  }

  static shaderPart() {
    return /* wgsl */ `
      struct Tile {
        x: u32,
        y: u32,
        w: u32,
        h: u32,
      }
    `;
  }
}
