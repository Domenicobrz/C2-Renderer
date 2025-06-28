<script lang="ts">
  import { globals } from '$lib/C2';
  import { renderView } from '../stores/main';
  import Github from './icons/Github.svelte';
  import ShadingSphere1 from './icons/ShadingSphere1.svelte';
  import ShadingSphere2 from './icons/ShadingSphere2.svelte';
  import ShadingSphere3 from './icons/ShadingSphere3.svelte';
  import Separator from './Separator.svelte';
  import VerticalToolbar from './VerticalToolbar.svelte';

  let versionNumbers = globals.version.split('.');
</script>

<VerticalToolbar side="left">
  <button on:click={() => ($renderView = 'preview')} class:active={$renderView == 'preview'}>
    <ShadingSphere1 />
  </button>
  <button on:click={() => ($renderView = 'realtime')} class:active={$renderView == 'realtime'}>
    <ShadingSphere2 />
  </button>
  <button on:click={() => ($renderView = 'compute')} class:active={$renderView == 'compute'}>
    <ShadingSphere3 />
  </button>

  <Separator />

  <a href="https://github.com/Domenicobrz/C2-Renderer" target="_blank">
    <button class="active">
      <Github />
    </button>
  </a>

  <div class="flex-spacer" />
  <p class="version-number">
    {#each versionNumbers as number, i}
      {number}
      {#if i != 2}
        <div class="dot" />
      {/if}
    {/each}
  </p>
</VerticalToolbar>

<style>
  .flex-spacer {
    flex: 1;
  }

  .version-number {
    text-align: center;
    font-size: 10px;
  }

  div.dot {
    border-radius: 100%;
    width: 2px;
    height: 2px;
    background: #777;
    margin: 7px auto;
  }
</style>
