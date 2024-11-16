import { get } from 'svelte/store';
import { configOptions } from '../routes/stores/main';
import { EventHandler } from './eventHandler';

export enum MIS_TYPE {
  BRDF_ONLY = 0,
  ONE_SAMPLE_MODEL = 1,
  NEXT_EVENT_ESTIMATION = 2
}

export enum SAMPLER_TYPE {
  UNIFORM = 0,
  HALTON = 1,
  BLUE_NOISE = 2
}

export enum SAMPLER_CORRELATION_FIX {
  NONE = 0,
  RANDOM_OFFSET = 1,
  RANDOM_ARRAY_OFFSET = 2
}

type ShaderConfig = {
  HAS_ENVMAP: boolean;
};

// this object needs to be serializeable, because of limitations caused by
// the optionsHistory madness inside createConfigStore(...)
export type ConfigOptions = {
  forceMaxTileSize: boolean;
  BOUNCES_COUNT: number;
  MIS_TYPE: MIS_TYPE;
  SAMPLER_TYPE: SAMPLER_TYPE;
  SAMPLER_CORRELATION_FIX: SAMPLER_CORRELATION_FIX;
  USE_POWER_HEURISTIC: 0 | 1;
  ENVMAP_SCALE: number;
  ENVMAP_ROTX: number;
  ENVMAP_ROTY: number;
  ENVMAP_USE_COMPENSATED_DISTRIBUTION: boolean;
  shaderConfig: ShaderConfig;
};

class ConfigManager {
  public options: ConfigOptions;
  public prevOptions: ConfigOptions;
  public e: EventHandler;
  public bufferSize = 16;

  constructor() {
    this.options = get(configOptions);
    this.prevOptions = this.options;
    this.e = new EventHandler();

    // we're subscribing to the svelte store
    configOptions.subscribe((value) => {
      this.options = value;
      this.prevOptions = configOptions.getOldValue();
      this.e.fireEvent('config-update', this.options);
    });
  }

  setStoreProperty(props: Partial<ConfigOptions>) {
    configOptions.set({ ...this.options, ...props });
  }

  getOptionsBuffer(): ArrayBuffer {
    return new Uint32Array([
      this.options.MIS_TYPE,
      this.options.SAMPLER_CORRELATION_FIX,
      this.options.USE_POWER_HEURISTIC,
      this.options.BOUNCES_COUNT
    ]);
  }

  // might return a different string with each invocation if internal shader configurations
  // have changed
  shaderPart(): string {
    return /* wgsl */ `

    const CORRELATION_FIX_NONE: u32 = ${SAMPLER_CORRELATION_FIX.NONE};
    const CORRELATION_FIX_RAND_OFFSET: u32 = ${SAMPLER_CORRELATION_FIX.RANDOM_OFFSET};
    const CORRELATION_FIX_RAND_ARRAY_OFFSET: u32 = ${SAMPLER_CORRELATION_FIX.RANDOM_ARRAY_OFFSET};

    const BRDF_ONLY: u32 = ${MIS_TYPE.BRDF_ONLY};
    const ONE_SAMPLE_MODEL: u32 = ${MIS_TYPE.ONE_SAMPLE_MODEL};
    const NEXT_EVENT_ESTIMATION: u32 = ${MIS_TYPE.NEXT_EVENT_ESTIMATION};
    
    struct Config {
      MIS_TYPE: u32,
      SAMPLER_CORRELATION_FIX: u32,
      USE_POWER_HEURISTIC: u32,
      BOUNCES_COUNT: i32,
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
