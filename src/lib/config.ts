import { get } from 'svelte/store';
import { configOptions } from '../routes/stores/main';
import { EventHandler } from './eventHandler';

export enum MIS_TYPE {
  BRDF_ONLY = 0,
  ONE_SAMPLE_MODEL = 1,
  NEXT_EVENT_ESTIMATION = 2
}

type ShaderConfig = {
  HAS_ENVMAP: boolean;
};

export type ConfigOptions = {
  MIS_TYPE: MIS_TYPE;
  USE_POWER_HEURISTIC: 0 | 1;
  ENVMAP_SCALE: number;
  ENVMAP_ROTX: number;
  ENVMAP_ROTY: number;
  shaderConfig: ShaderConfig;
};

class ConfigManager {
  public options: ConfigOptions;
  public e: EventHandler;
  public bufferSize = 8;

  constructor() {
    this.options = get(configOptions);
    this.e = new EventHandler();

    // we're subscribing to the svelte store
    configOptions.subscribe((value) => {
      this.options = value;
      this.e.fireEvent('config-update');
    });
  }

  setStoreProperty(props: Partial<ConfigOptions>) {
    configOptions.set({ ...this.options, ...props });
  }

  getOptionsBuffer(): ArrayBuffer {
    return new Uint32Array([this.options.MIS_TYPE, this.options.USE_POWER_HEURISTIC]);
  }

  // might return a different string with each invocation if internal shader configurations
  // have changed
  shaderPart(): string {
    return /* wgsl */ `

    const BRDF_ONLY: u32 = ${MIS_TYPE.BRDF_ONLY};
    const ONE_SAMPLE_MODEL: u32 = ${MIS_TYPE.ONE_SAMPLE_MODEL};
    const NEXT_EVENT_ESTIMATION: u32 = ${MIS_TYPE.NEXT_EVENT_ESTIMATION};
    
    struct Config {
      MIS_TYPE: u32,
      USE_POWER_HEURISTIC: u32,
    }

    struct ShaderConfig {
      HAS_ENVMAP: bool,
    }
    // this object, or the shaderConfig object inside the singleton instance of ConfigManager,
    // can be used to customize / change all the shader-parts returned by the rest of the 
    // classes of C2
    const shaderConfig = ShaderConfig(
      ${this.options.shaderConfig.HAS_ENVMAP},
    );
    `;
  }
}

// exporting singleton since it's referencing the svelte store value for the config
export const configManager = new ConfigManager();
