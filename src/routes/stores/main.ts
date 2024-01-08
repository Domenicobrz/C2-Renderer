import { writable } from 'svelte/store';

type BVHInfo = {
  nodesCount: Number;
};

export const bvhInfo = writable<BVHInfo>({ nodesCount: 0 });
