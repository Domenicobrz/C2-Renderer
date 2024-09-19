import { Vector2 } from 'three';
import { samplesInfo } from '../routes/stores/main';
import { configManager } from './config';
import type { ConfigOptions } from './config';

export type Tile = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export class TileSequence {
  private canvasSize: Vector2 = new Vector2(0, 0);
  private tile: Tile = { x: 0, y: 0, w: 0, h: 0 };
  // used for both increments and decrements
  private tileIncrementCount = 0;
  private forceMaxTileSize: boolean = false;

  constructor() {
    configManager.e.addEventListener('config-update', (options: ConfigOptions) => {
      this.forceMaxTileSize = options.forceMaxTileSize;
    });
  }

  setCanvasSize(canvasSize: Vector2) {
    this.canvasSize = canvasSize;
    this.resetTile();
  }

  // we're only going to measure the performance of tiles that are
  // almost fully contained inside the canvas, to avoid the scenario where
  // a tile that is 90% outside the canvas can return a performance metric
  // that doesn't consider all the pixels we haven't computed
  isTilePerformanceMeasureable() {
    // we're subtracting 8 because each tile will be a multiple of 8
    if (
      this.tile.x + this.tile.w - 8 <= this.canvasSize.x &&
      this.tile.y + this.tile.h - 8 <= this.canvasSize.y
    )
      return true;
    return false;
  }

  canTileSizeBeIncreased() {
    if (this.tile.w < this.canvasSize.x || this.tile.h < this.canvasSize.y) return true;
    return false;
  }

  canTileSizeBeDecreased() {
    if (this.tile.w > 16 || this.tile.h > 16) return true;
    return false;
  }

  decreaseTileSize() {
    if (this.forceMaxTileSize) return;

    // we're either decreasing the width or the height,
    // to decrease the performance load of 2x
    // (if we decrease both performance load decreases by 4x)
    // also notice that % 2 === is 1 here and 0 in the other function
    if (this.tileIncrementCount % 2 === 1) {
      this.tile.w /= 2;
      this.tile.w = Math.ceil(this.tile.w / 8) * 8;
    } else {
      this.tile.h /= 2;
      this.tile.h = Math.ceil(this.tile.h / 8) * 8;
    }

    if (this.tile.w < 16) {
      this.tile.w = 16;
    }
    if (this.tile.h < 16) {
      this.tile.h = 16;
    }

    // by subtracting tile.w to the x position,
    // getNextTile() will pick the previous position as the next tile position
    // basically when we increase the tile size we want the tile to remain
    // in place
    // this.tile.x -= this.tile.w;

    this.tileIncrementCount -= 1;
    samplesInfo.setTileSize(`${this.tile.w} x ${this.tile.h}`);
  }

  increaseTileSize() {
    // we're either increasing the width or the height,
    // to increase the performance load of 2x
    // (if we increase both performance load increases by 4x)
    if (this.tileIncrementCount % 2 === 0) {
      this.tile.w *= 2;
    } else {
      this.tile.h *= 2;
    }

    if (this.tile.w > this.canvasSize.x) {
      this.tile.w = Math.ceil(this.canvasSize.x / 8) * 8;
    }
    if (this.tile.h > this.canvasSize.y) {
      this.tile.h = Math.ceil(this.canvasSize.y / 8) * 8;
    }

    // by subtracting tile.w to the x position,
    // getNextTile() will pick the previous position as the next tile position
    // basically when we increase the tile size we want the tile to remain
    // in place
    this.tile.x -= this.tile.w;

    this.tileIncrementCount += 1;
    samplesInfo.setTileSize(`${this.tile.w} x ${this.tile.h}`);
  }

  resetTile() {
    this.tileIncrementCount = 0;
    let sizex = 16;
    let sizey = 16;

    if (this.forceMaxTileSize) {
      sizex = this.canvasSize.x;
      sizey = this.canvasSize.y;
    }

    samplesInfo.setTileSize(`${sizex} x ${sizey}`);
    // we decided tilesize will be a multiple of 8
    this.tile = { x: this.canvasSize.x, y: this.canvasSize.y, w: sizex, h: sizey };
  }

  getNextTile(onTileStart: () => void) {
    this.tile.x += this.tile.w;

    if (this.tile.x >= this.canvasSize.x) {
      this.tile.x = 0;
      this.tile.y += this.tile.h;
    }

    if (this.tile.y >= this.canvasSize.y) {
      this.tile.x = 0;
      this.tile.y = 0;
      onTileStart();
    }

    return this.tile;
  }

  getCurrentTile() {
    return this.tile;
  }

  getWorkGroupCount() {
    return new Vector2(this.tile.w / 8, this.tile.h / 8);
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
