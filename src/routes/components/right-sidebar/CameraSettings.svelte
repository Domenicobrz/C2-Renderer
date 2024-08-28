<script lang="ts">
  import { Vector2 } from 'three';
  import { cameraInfoStore } from '../../stores/main';
  import IronSightIcon from '../icons/IronSightIcon.svelte';
  import Spacer from '../Spacer.svelte';
  import type { RendererInterface } from '$lib/C2';

  export let canvasRef: HTMLCanvasElement;
  export let renderer: RendererInterface;

  $: {
    if (canvasRef) {
      canvasRef.addEventListener('click', onCanvasClick);
    }
  }

  let clickSetFocusDistance = false;

  function onFDBtnClick() {
    clickSetFocusDistance = true;
  }

  function onCanvasClick(e: MouseEvent) {
    if (clickSetFocusDistance) {
      let x = e.offsetX;
      let y = canvasRef.clientHeight - e.offsetY;
      let t = renderer.getFocusDistanceFromScreenPoint(new Vector2(x, y));
      if (t > -1) {
        $cameraInfoStore.focusDistance = t;
      }
      clickSetFocusDistance = false;
    }
  }
</script>

<span
  >Exposure: <input
    class="samples-limit-input"
    type="text"
    bind:value={$cameraInfoStore.exposure}
  /></span
>
<Spacer vertical={5} />
<span>Fov: <input class="samples-limit-input" type="text" bind:value={$cameraInfoStore.fov} /></span
>
<Spacer vertical={5} />
<span
  >Aperture: <input
    class="samples-limit-input"
    type="text"
    bind:value={$cameraInfoStore.aperture}
  /></span
>
<Spacer vertical={5} />
<div class="fd-flex-row">
  <span>Focus distance:</span>
  <Spacer horizontal={5} />
  <input class="samples-limit-input" type="text" bind:value={$cameraInfoStore.focusDistance} />
  <Spacer horizontal={5} />
  <button class="click-set-fd" class:active={clickSetFocusDistance} on:click={onFDBtnClick}
    ><IronSightIcon /></button
  >
</div>

<style>
  .samples-limit-input {
    width: 50px;
  }

  button {
    background: #333;
    color: #ddd;
    border-radius: 4px;
    padding: 5px 10px;
    border: 1px solid #636363;
  }

  button:active {
    background: #454545;
  }

  button.click-set-fd {
    width: 25px;
    height: 25px;
    padding: 0;
  }
  button:active {
    background: #333;
  }
  :global(button.click-set-fd > svg) {
    fill: #666;
  }
  :global(button.active.click-set-fd > svg) {
    fill: #bbb;
  }

  input[type='text'] {
    background: #454545;
    color: #ddd;
    border-radius: 4px;
    padding: 3px 7px;
    border: 1px solid #636363;
    font-size: 12px;
  }

  span {
    font-size: 15px;
  }

  .fd-flex-row {
    display: flex;
    flex-flow: row nowrap;
    align-items: center;
    margin: 0 0 -5px 0;
  }
</style>
