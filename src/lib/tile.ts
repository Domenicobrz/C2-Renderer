import { Vector2 } from 'three';
import { samplesInfo } from '../routes/stores/main';
import { ConfigManager } from './config';
import type { ConfigOptions } from './config';
import { EventHandler } from './eventHandler';

export type Tile = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type TilePeformanceRequirements = {
  changeTileSizeOnNewLineOnly: boolean;
  performanceHistoryCount: number;
  // number of milliseconds after which we'll decrease the tile size
  avgPerfToDecrease: number;
  // number of milliseconds under which we'll increase the tile size
  avgPerfToIncrease: number;
};

export class TileSequence {
  private canvasSize: Vector2 = new Vector2(0, 0);
  public tile: Tile = { x: 0, y: 0, w: 0, h: 0 };
  // used for both increments and decrements
  private tileIncrementCount = 0;
  private forceMaxTileSize: boolean = false;
  private requestedRestart: boolean = true;

  public performanceHistoryCount = 15;
  public performanceHistory: number[] = [];

  public e: EventHandler = new EventHandler();

  constructor(private performanceRequirements?: TilePeformanceRequirements) {
    let configManager = new ConfigManager();
    configManager.e.addEventListener('config-update', (options: ConfigOptions) => {
      this.forceMaxTileSize = options.forceMaxTileSize;
    });

    if (performanceRequirements) {
      this.performanceHistoryCount = performanceRequirements.performanceHistoryCount;
    }
  }

  saveComputationPerformance(value: number) {
    this.performanceHistory.push(value);
    if (this.performanceHistory.length > this.performanceHistoryCount) {
      this.performanceHistory.splice(0, 1);
    }
  }

  getAveragePerformance() {
    if (this.performanceHistory.length > 0) {
      return (
        this.performanceHistory.reduce((prev, curr) => prev + curr, 0) /
        this.performanceHistory.length
      );
    }

    return 0;
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

    this.tileIncrementCount += 1;
    samplesInfo.setTileSize(`${this.tile.w} x ${this.tile.h}`);
  }

  resetTile(initialSize?: Vector2) {
    this.tileIncrementCount = 0;
    let sizex = 16;
    let sizey = 16;

    if (initialSize) {
      sizex = initialSize.x;
      sizey = initialSize.y;
    }

    if (this.forceMaxTileSize) {
      sizex = this.canvasSize.x;
      sizey = this.canvasSize.y;
    }

    samplesInfo.setTileSize(`${sizex} x ${sizey}`);
    this.tile = { x: 0, y: 0, w: sizex, h: sizey };
    this.requestedRestart = true;

    this.performanceHistory = [];
  }

  performanceBasedUpdates() {
    let { performanceRequirements } = this;
    if (!performanceRequirements) return;
    let { avgPerfToDecrease, avgPerfToIncrease, changeTileSizeOnNewLineOnly } =
      performanceRequirements;

    let avgPerf = this.getAveragePerformance();

    if (avgPerf === 0) return;
    if (changeTileSizeOnNewLineOnly && !this.isNewLine()) return;

    if (avgPerf < avgPerfToIncrease && this.canTileSizeBeIncreased()) {
      if (this.canTileSizeBeIncreased()) {
        this.increaseTileSize();
        this.e.fireEvent('on-tile-size-increased', {});
      }
    }
    if (avgPerf > avgPerfToDecrease && this.canTileSizeBeDecreased()) {
      if (this.canTileSizeBeDecreased()) {
        this.decreaseTileSize();
        this.e.fireEvent('on-tile-size-decreased', {});
      }
    }
  }

  getNextTile() {
    if (this.requestedRestart) {
      this.requestedRestart = false;
      this.tile.x = 0;
      this.tile.y = 0;

      this.e.fireEvent('on-tile-start', {});

      // we'll have to change tile size based on performance
      // *before* establishing if this is the last tile before restart
      this.performanceBasedUpdates();

      // if the tile covers the entire screen, on the next call request again a re-start
      if (this.isLastTileBeforeRestart()) {
        this.requestedRestart = true;
      }

      return this.tile;
    }
    // if we got here, the previous tile wasn't the last one before restarting

    // [x ... x+w] was computed in the previous iteration, now add and select the new one
    this.tile.x += this.tile.w;

    if (this.tile.x >= this.canvasSize.x) {
      this.tile.x = 0;
      this.tile.y += this.tile.h;
    }

    // we'll have to change tile size based on performance
    // *before* establishing if this is the last tile before restart
    this.performanceBasedUpdates();

    if (this.isLastTileBeforeRestart()) {
      this.requestedRestart = true;
    }

    return this.tile;
  }

  // certain algorithms like ReSTIR PT require tiles to be
  // increased or decreased only when we reach a new line
  isNewLine() {
    if (this.tile.x == 0) return true;
    return false;
  }

  isTileStarting() {
    if (this.tile.x == 0 && this.tile.y == 0) return true;
  }

  // TODO: this is sort of a duplicate of the function above
  isLastTileBeforeRestart() {
    let w = this.tile.w;
    let h = this.tile.h;
    let x = this.tile.x;
    let y = this.tile.y;

    if (x + w >= this.canvasSize.x && y + h >= this.canvasSize.y) {
      return true;
    }

    return false;
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
