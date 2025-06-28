import { get } from 'svelte/store';
import { configOptions } from '../routes/stores/main';
import { EventHandler } from './eventHandler';
import { getChangedKeys } from './utils/getChangedKeys';

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

export enum ReSTIR_SAMPLER_TYPE {
  UNIFORM = 0,
  HALTON_2_THEN_UNIFORM = 1,
  BLUE_NOISE = 2
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
    RESTIR_SR_PASS_COUNT: number;
    SR_CIRCLE_RADIUS: number;
    MAX_CONFIDENCE: number;
    RESTIR_TEMP_CANDIDATES: number;
    USE_TEMPORAL_RESAMPLE: boolean;
    SAMPLER_TYPE: ReSTIR_SAMPLER_TYPE;
    GBH_VARIANT: 'Pairwise MIS' | '1/M Biased';
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

      // used for debugging
      // console.log(getChangedKeys(this.options, this.prevOptions));

      this.e.fireEvent('config-update', this.options);
    });
  }

  setStoreProperty(props: Partial<ConfigOptions>) {
    configOptions.set({ ...this.options, ...props });
  }

  getOptionsBuffer(): ArrayBuffer {
    return new ArrayBuffer();
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
    ]).buffer;
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
  public bufferSize = 32;

  getOptionsBuffer(): ArrayBuffer {
    const ConfigValues = new ArrayBuffer(32);
    const ConfigViews = {
      USE_POWER_HEURISTIC: new Uint32Array(ConfigValues, 0, 1),
      BOUNCES_COUNT: new Int32Array(ConfigValues, 4, 1),
      RESTIR_INITIAL_CANDIDATES: new Int32Array(ConfigValues, 8, 1),
      RESTIR_SR_CANDIDATES: new Int32Array(ConfigValues, 12, 1),
      RESTIR_TEMP_CANDIDATES: new Int32Array(ConfigValues, 16, 1),
      USE_TEMPORAL_RESAMPLE: new Uint32Array(ConfigValues, 20, 1),
      MAX_CONFIDENCE: new Float32Array(ConfigValues, 24, 1),
      SR_CIRCLE_RADIUS: new Float32Array(ConfigValues, 28, 1)
    };

    ConfigViews.USE_POWER_HEURISTIC.set([this.options.ReSTIR.USE_POWER_HEURISTIC]);
    ConfigViews.BOUNCES_COUNT.set([this.options.BOUNCES_COUNT]);
    ConfigViews.RESTIR_INITIAL_CANDIDATES.set([this.options.ReSTIR.RESTIR_INITIAL_CANDIDATES]);
    ConfigViews.RESTIR_SR_CANDIDATES.set([this.options.ReSTIR.RESTIR_SR_CANDIDATES]);
    ConfigViews.RESTIR_TEMP_CANDIDATES.set([this.options.ReSTIR.RESTIR_TEMP_CANDIDATES]);
    ConfigViews.USE_TEMPORAL_RESAMPLE.set([this.options.ReSTIR.USE_TEMPORAL_RESAMPLE ? 1 : 0]);
    ConfigViews.MAX_CONFIDENCE.set([this.options.ReSTIR.MAX_CONFIDENCE]);
    ConfigViews.SR_CIRCLE_RADIUS.set([this.options.ReSTIR.SR_CIRCLE_RADIUS]);

    return ConfigValues;
  }

  // might return a different string with each invocation if internal shader configurations
  // have changed
  shaderPart(): string {
    return /* wgsl */ `

    struct Config {
      USE_POWER_HEURISTIC: u32,
      BOUNCES_COUNT: i32,
      RESTIR_INITIAL_CANDIDATES: i32,
      RESTIR_SR_CANDIDATES: i32,
      RESTIR_TEMP_CANDIDATES: i32,
      USE_TEMPORAL_RESAMPLE: u32,
      MAX_CONFIDENCE: f32,
      SR_CIRCLE_RADIUS: f32,
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
