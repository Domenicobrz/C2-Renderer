import { ReSTIR_SAMPLER_TYPE, type ConfigOptions } from '$lib/config';
import type { SceneName } from '$lib/createScene';
import { getURLParam } from '$lib/utils/getURLParam';
import { get, writable } from 'svelte/store';
import { Vector2, Vector3 } from 'three';

type BVHInfo = {
  nodesCount: number;
};
export const bvhInfo = writable<BVHInfo>({ nodesCount: 0 });

export const renderView = writable<'preview' | 'realtime' | 'compute'>('compute');

export const centralErrorStatusMessage = writable<string>('');
export const centralStatusMessage = writable<string>('');

type ReSTIRState = {
  state: string;
  initialCandidateIndex: number;
  srPassIndex: number;
  bufferSizeMB: number;
};

export const adapterInfo = writable<Record<string, number>>({});

type SamplesInfo = {
  limit: number;
  count: number;
  ms: number;
  tileSize: string;
  clickTarget: string;
  integrator: {
    ReSTIR: ReSTIRState | null;
  };
};
export const samplesInfo = (function createSamplesInfoStore() {
  let store = writable<SamplesInfo>({
    limit: 200,
    count: 0,
    ms: 0,
    tileSize: '',
    clickTarget: '(0, 0)',
    integrator: {
      ReSTIR: null
    }
  });

  return {
    subscribe: store.subscribe,
    set: store.set,
    update: store.update,
    get count() {
      return get(store).count;
    },
    get limit() {
      return get(store).limit;
    },
    setTileSize(value: string) {
      store.update((si) => {
        si.tileSize = value;
        return si;
      });
    },
    setPerformance: (value: number) => {
      store.update((si) => {
        si.ms = value;
        return si;
      });
    },
    setLimit: (value: number) => {
      store.update((si) => {
        si.limit = value;
        return si;
      });
    },
    setReSTIRState: (state: ReSTIRState) => {
      store.update((si) => {
        si.integrator.ReSTIR = state;
        return si;
      });
    },
    increment: () =>
      store.update((si) => {
        si.count++;
        return si;
      }),
    reset: () =>
      store.update((si) => {
        si.count = 0;
        return si;
      })
  };
})();

type CameraInfo = {
  exposure: number;
  aperture: number;
  focusDistance: number;
  fov: number;
  tiltShift: Vector2;
  catsEyeBokehEnabled: boolean;
  catsEyeBokehMult: number;
  catsEyeBokehPow: number;
};
type CameraMovementInfo = {
  movementSpeed: number;
  rotationSpeed: number;
  position: Vector3;
  target: Vector3;
};

let initialScene: SceneName = 'C2 features';
const selectedSceneFromParams = getURLParam('scene') || '';
if (selectedSceneFromParams) {
  initialScene = selectedSceneFromParams as SceneName;
}
export const selectedSceneStore = writable<SceneName>(initialScene);

export const cameraInfoStore = writable<CameraInfo>({
  exposure: 1,
  aperture: 0,
  focusDistance: 1,
  fov: Math.PI * 0.25,
  tiltShift: new Vector2(0, 0),
  catsEyeBokehEnabled: false,
  catsEyeBokehMult: 0,
  catsEyeBokehPow: 0
});

export const cameraMovementInfoStore = writable<CameraMovementInfo>({
  movementSpeed: 1,
  rotationSpeed: 1,
  position: new Vector3(0, 0, 0),
  target: new Vector3(0, 0, 0)
});

export const configOptions = createConfigStore({
  forceMaxTileSize: false,
  BOUNCES_COUNT: 10,

  ENVMAP_SCALE: 1,
  ENVMAP_ROTX: 0,
  ENVMAP_ROTY: 0,
  ENVMAP_USE_COMPENSATED_DISTRIBUTION: false,

  integrator: 'Simple-path-trace',
  // integrator: 'ReSTIR',

  SimplePathTrace: {
    MIS_TYPE: 1,
    SAMPLER_TYPE: 3,
    SAMPLER_DECORRELATION: 3,
    USE_POWER_HEURISTIC: 1
  },

  ReSTIR: {
    SAMPLER_TYPE: ReSTIR_SAMPLER_TYPE.UNIFORM,
    USE_POWER_HEURISTIC: 1,
    RESTIR_INITIAL_CANDIDATES: 1, // the paper recommends 50 I think
    // the paper recommends 6, but on my machine occupancy rates seems to be horrible at 6
    RESTIR_SR_CANDIDATES: 6,
    RESTIR_SR_PASS_COUNT: 3,
    RESTIR_TEMP_CANDIDATES: 2,
    SR_CIRCLE_RADIUS: 10.0,
    MAX_CONFIDENCE: 10,
    USE_TEMPORAL_RESAMPLE: false,
    GBH_VARIANT: 'Pairwise MIS'
  },

  shaderConfig: {
    HAS_ENVMAP: false
  }
});

function createConfigStore(initialValue: ConfigOptions) {
  const { subscribe, set, update } = writable<ConfigOptions>(initialValue);

  // purtroppo sto bordello è necessario perchè a volte svelte modifica direttamente
  // l'oggetto dello store
  let oldValues: ConfigOptions[] = [initialValue, initialValue];

  return {
    subscribe,
    set: (value: ConfigOptions) => {
      oldValues[0] = oldValues[1];
      oldValues[1] = JSON.parse(JSON.stringify(value));
      set(value);
    },
    update: (fn: any) => {
      update((currentValue) => {
        oldValues[0] = oldValues[1];
        oldValues[1] = JSON.parse(JSON.stringify(currentValue));
        return fn(currentValue);
      });
    },
    getOldValue: () => oldValues[0]
  };
}
