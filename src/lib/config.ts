import { get } from 'svelte/store';
import { configOptions } from '../routes/stores/main';
import { EventHandler } from './eventHandler';

export enum MIS_TYPE {
  BRDF_ONLY = 0,
  ONE_SAMPLE_MODEL = 1,
  NEXT_EVENT_ESTIMATION = 2
}

export type ConfigOptions = {
  MIS_TYPE: MIS_TYPE;
  USE_POWER_HEURISTIC: 0 | 1;
};

export class Config {
  private options: ConfigOptions;
  public e: EventHandler;

  constructor() {
    this.options = get(configOptions);
    this.e = new EventHandler();

    // we're subscribing to the svelte store
    configOptions.subscribe((value) => {
      this.options = value;
      this.e.fireEvent('config-update');
    });
  }

  static bufferSize = 8;
  getOptionsBuffer(): ArrayBuffer {
    return new Uint32Array([this.options.MIS_TYPE, this.options.USE_POWER_HEURISTIC]);
  }

  static shaderPart(): string {
    return /* wgsl */ `

    const BRDF_ONLY: u32 = ${MIS_TYPE.BRDF_ONLY};
    const ONE_SAMPLE_MODEL: u32 = ${MIS_TYPE.ONE_SAMPLE_MODEL};
    const NEXT_EVENT_ESTIMATION: u32 = ${MIS_TYPE.NEXT_EVENT_ESTIMATION};
    
    struct Config {
      MIS_TYPE: u32,
      USE_POWER_HEURISTIC: u32,
    }

    `;
  }
}
