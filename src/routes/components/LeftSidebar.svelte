<script lang="ts">
  import { renderView } from '../stores/main';
  import ShadingSphere1 from './icons/ShadingSphere1.svelte';
  import ShadingSphere2 from './icons/ShadingSphere2.svelte';
  import ShadingSphere3 from './icons/ShadingSphere3.svelte';
</script>

<div class="left-sidebar">
  <button on:click={() => ($renderView = 'preview')} class:active={$renderView == 'preview'}>
    <ShadingSphere1 />
  </button>
  <button on:click={() => ($renderView = 'realtime')} class:active={$renderView == 'realtime'}>
    <ShadingSphere2 />
  </button>
  <button on:click={() => ($renderView = 'compute')} class:active={$renderView == 'compute'}>
    <ShadingSphere3 />
  </button>
</div>

<style>
  .left-sidebar {
    flex: 0 0 35px;
    height: 100%;
    border-right: 1px solid #333;
    color: #ddd;
    background: #191919;

    padding: 10px 7px 7px 7px;
  }

  button {
    width: 21px;
    height: 21px;
    background: transparent;
    border: none;
    padding: 0px;
    margin: 0 0 8px 0;
  }
  :global(button > svg) {
    fill: #666;
  }
  :global(button.active > svg) {
    fill: #bbb;
  }

  /* button:active {
    background: #454545;
  } */
</style>
