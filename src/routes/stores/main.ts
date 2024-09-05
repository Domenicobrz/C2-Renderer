import type { ConfigOptions } from '$lib/config';
import { get, writable } from 'svelte/store';
import { Vector2 } from 'three';

type BVHInfo = {
  nodesCount: number;
};
export const bvhInfo = writable<BVHInfo>({ nodesCount: 0 });

export const renderView = writable<'preview' | 'realtime' | 'compute'>('compute');

type SamplesInfo = {
  limit: number;
  count: number;
  ms: number;
  tileSize: string;
};
export const samplesInfo = (function createSamplesInfoStore() {
  let store = writable<SamplesInfo>({
    limit: 8,
    count: 0,
    ms: 0,
    tileSize: ''
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
};
type CameraMovementInfo = {
  movementSpeed: number;
  rotationSpeed: number;
};
export const cameraInfoStore = writable<CameraInfo>({
  exposure: 1,
  aperture: 0,
  focusDistance: 1,
  fov: Math.PI * 0.25,
  tiltShift: new Vector2(0, 0)
});

export const cameraMovementInfoStore = writable<CameraMovementInfo>({
  movementSpeed: 1,
  rotationSpeed: 1
});

export const configOptions = createConfigStore({
  MIS_TYPE: 2,
  USE_POWER_HEURISTIC: 1,
  ENVMAP_SCALE: 1,
  ENVMAP_ROTX: 0,
  ENVMAP_ROTY: 0,
  ENVMAP_USE_COMPENSATED_DISTRIBUTION: false,
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
