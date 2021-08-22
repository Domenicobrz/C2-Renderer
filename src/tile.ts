import { Vector2 } from "three";

export class Tile {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly samples: number;
  data: number[];

  constructor(x: number, y: number, width: number, height: number, samples: number, data: number[]) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.samples = samples;
    this.data = data;
  }
}

export class TileManager {
  static resetTileData(tile: Tile): void {
    if(!tile.data) {
      tile.data = new Array(tile.width * tile.height * 3);
    }

    for (let i = 0; i < tile.data.length; i++) {
      tile.data[i] = 0;
    }
  }
  
  static addSample(radianceData: Float32Array, canvasSize: Vector2, tile: Tile): void {
    for(let i = 0; i < tile.width; i++) {
      for(let j = 0; j < tile.height; j++) {
        let x = tile.x + i;
        let y = tile.y + j;

        let index = (canvasSize.x * y + x) * 3;

        radianceData[index+0] += tile.data[index+0];
        radianceData[index+1] += tile.data[index+1];
        radianceData[index+2] += tile.data[index+2];
      }
    }
  }
}
