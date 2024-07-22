import type { ConfigOptions } from '$lib/config';
import { get, writable } from 'svelte/store';

type BVHInfo = {
  nodesCount: number;
};
export const bvhInfo = writable<BVHInfo>({ nodesCount: 0 });

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

export const configOptions = writable<ConfigOptions>({
  MIS_TYPE: 2,
  USE_POWER_HEURISTIC: 1,
  ENVMAP_SCALE: 1
});
