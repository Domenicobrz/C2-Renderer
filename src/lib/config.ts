import { get } from 'svelte/store';
import { configOptions } from '../routes/stores/main';
import { EventHandler } from './eventHandler';

export enum MIS_TYPE {
  BRDF_ONLY = 0,
  NEXT_EVENT_ESTIMATION = 1
}

export enum SAMPLER_TYPE {
  UNIFORM = 0,
  HALTON = 1,
  BLUE_NOISE = 2,
  CUSTOM_R2 = 3
}

export enum SAMPLER_DECORRELATION {
  NONE = 0,
  RANDOM_OFFSET = 1,
  RANDOM_ARRAY_OFFSET = 2,
  BLUE_NOISE_MASK = 3
}

type ShaderConfig = {
  HAS_ENVMAP: boolean;
};

export type IntegratorType = 'ReSTIR' | 'Simple-path-trace';

// this object needs to be serializeable, because of limitations caused by
// the optionsHistory madness inside createConfigStore(...)
export type ConfigOptions = {
  forceMaxTileSize: boolean;
  BOUNCES_COUNT: number;
  ENVMAP_SCALE: number;
  ENVMAP_ROTX: number;
  ENVMAP_ROTY: number;
  ENVMAP_USE_COMPENSATED_DISTRIBUTION: boolean;
  shaderConfig: ShaderConfig;
  integrator: IntegratorType;
  SimplePathTrace: {
    MIS_TYPE: MIS_TYPE;
    SAMPLER_TYPE: SAMPLER_TYPE;
    SAMPLER_DECORRELATION: SAMPLER_DECORRELATION;
    USE_POWER_HEURISTIC: 0 | 1;
  };
  ReSTIR: {
    USE_POWER_HEURISTIC: 0 | 1;
    RESTIR_INITIAL_CANDIDATES: number;
    RESTIR_SR_CANDIDATES: number;
    RESTIR_TEMP_CANDIDATES: number;
    USE_TEMPORAL_RESAMPLE: 0 | 1;
  };
};

export class ConfigManager {
  public options: ConfigOptions;
  public prevOptions: ConfigOptions;
  public e: EventHandler;
  public bufferSize = 0;

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
    return new Uint32Array([]);
  }

  // might return a different string with each invocation if internal shader configurations
  // have changed
  shaderPart(): string {
    return /* wgsl */ ``;
  }
}

export class SPTConfigManager extends ConfigManager {
  public bufferSize = 16;

  getOptionsBuffer(): ArrayBuffer {
    return new Uint32Array([
      this.options.SimplePathTrace.MIS_TYPE,
      this.options.SimplePathTrace.SAMPLER_DECORRELATION,
      this.options.SimplePathTrace.USE_POWER_HEURISTIC,
      this.options.BOUNCES_COUNT
    ]);
  }

  // might return a different string with each invocation if internal shader configurations
  // have changed
  shaderPart(): string {
    return /* wgsl */ `

    const DECORRELATION_NONE: u32 = ${SAMPLER_DECORRELATION.NONE};
    const DECORRELATION_RAND_OFFSET: u32 = ${SAMPLER_DECORRELATION.RANDOM_OFFSET};
    const DECORRELATION_RAND_ARRAY_OFFSET: u32 = ${SAMPLER_DECORRELATION.RANDOM_ARRAY_OFFSET};
    const DECORRELATION_BLUE_NOISE_MASK: u32 = ${SAMPLER_DECORRELATION.BLUE_NOISE_MASK};

    const BRDF_ONLY: u32 = ${MIS_TYPE.BRDF_ONLY};
    const NEXT_EVENT_ESTIMATION: u32 = ${MIS_TYPE.NEXT_EVENT_ESTIMATION};
    
    struct Config {
      MIS_TYPE: u32,
      SAMPLER_DECORRELATION: u32,
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

export class ReSTIRConfigManager extends ConfigManager {
  public bufferSize = 24;

  getOptionsBuffer(): ArrayBuffer {
    return new Uint32Array([
      this.options.ReSTIR.USE_POWER_HEURISTIC,
      this.options.BOUNCES_COUNT,
      this.options.ReSTIR.RESTIR_INITIAL_CANDIDATES,
      this.options.ReSTIR.RESTIR_SR_CANDIDATES,
      this.options.ReSTIR.RESTIR_TEMP_CANDIDATES,
      this.options.ReSTIR.USE_TEMPORAL_RESAMPLE
    ]);
  }

  // might return a different string with each invocation if internal shader configurations
  // have changed
  shaderPart(): string {
    return /* wgsl */ `

    const DECORRELATION_NONE: u32 = ${SAMPLER_DECORRELATION.NONE};
    const DECORRELATION_RAND_OFFSET: u32 = ${SAMPLER_DECORRELATION.RANDOM_OFFSET};
    const DECORRELATION_RAND_ARRAY_OFFSET: u32 = ${SAMPLER_DECORRELATION.RANDOM_ARRAY_OFFSET};
    const DECORRELATION_BLUE_NOISE_MASK: u32 = ${SAMPLER_DECORRELATION.BLUE_NOISE_MASK};

    struct Config {
      USE_POWER_HEURISTIC: u32,
      BOUNCES_COUNT: i32,
      RESTIR_INITIAL_CANDIDATES: i32,
      RESTIR_SR_CANDIDATES: i32,
      RESTIR_TEMP_CANDIDATES: i32,
      USE_TEMPORAL_RESAMPLE: u32,
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
