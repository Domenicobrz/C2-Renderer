import { get, writable } from 'svelte/store';

type BVHInfo = {
  nodesCount: number;
};
export const bvhInfo = writable<BVHInfo>({ nodesCount: 0 });

type SamplesInfo = {
  limit: number;
  count: number;
};
export const samplesInfo = (function createSamplesInfoStore() {
  let store = writable<SamplesInfo>({
    limit: 50,
    count: 0
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
