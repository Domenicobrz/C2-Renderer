import { Vector2, Vector3 } from "three";
import { Tile } from "./tile";

export interface IWorkerMessage {
  type: string,
}

export interface IStartMessage extends IWorkerMessage {
  tile: Tile,
  canvasSize : Vector2,
  scene : string,
  workerIndex : number,
};

export class ComputationRequest implements IWorkerMessage {
  readonly type: string = "computation-request";
  readonly tile: Tile;

  constructor(tile: Tile) {
    this.tile = tile;
  }
}

export class ComputationResult implements IWorkerMessage {
  readonly type: string = "computation-result";
  readonly tile: Tile;
  readonly workerIndex: number;

  constructor(workerIndex: number, tile: Tile) {
    this.workerIndex = workerIndex;
    this.tile = tile;
  }
}