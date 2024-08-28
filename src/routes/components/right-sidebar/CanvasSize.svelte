<script lang="ts">
  import RangeSlider from 'svelte-range-slider-pips';
  import Spacer from '../Spacer.svelte';
  import Toggle from '../Toggle.svelte';
  import { tick } from 'svelte';

  export let canvasContainerEl: HTMLDivElement;
  export let width: number[] = [1];
  export let height: number[] = [1];

  let maxCanvasSize = 0;
  let fullScreenCanvas = false;
  let hasDoneFirstResize = false;

  $: {
    if (canvasContainerEl) {
      setMaxCanvasSize();

      if (!hasDoneFirstResize) {
        // for some reason I need to tick to
        // wait for the range slider to fully initialize
        // before I can set the first resize values
        tick().then(() => {
          width = [800];
          height = [600];
        });
        hasDoneFirstResize = true;
      }

      const resizeObserver = new ResizeObserver((entries) => {
        setMaxCanvasSize();
        // surprisingly, svelte "knows" the proper value of fullScreenCanvas
        // even if this callback is being specified inside the onMount event
        // listener
        if (fullScreenCanvas) {
          setFullScreenCanvasSize();
        }
      });
      resizeObserver.observe(canvasContainerEl);
    }
  }

  function setMaxCanvasSize() {
    maxCanvasSize = Math.floor(Math.max(innerHeight, innerWidth) * 1.0);
  }

  function setFullScreenCanvasSize() {
    const cr = canvasContainerEl.getBoundingClientRect();
    width = [cr.width - 30];
    height = [cr.height - 30];
  }

  function toggleFullScreen() {
    if (fullScreenCanvas) {
      setFullScreenCanvasSize();
    }
  }
</script>

<div class="flex-row">
  <label>width: </label>
  <RangeSlider
    min={1}
    max={maxCanvasSize}
    bind:values={width}
    pips
    float
    pipstep={100}
    springValues={{ stiffness: 1, damping: 1 }}
  />
</div>
<div class="flex-row">
  <label>height: </label>
  <RangeSlider
    min={1}
    max={maxCanvasSize}
    bind:values={height}
    pips
    float
    pipstep={100}
    springValues={{ stiffness: 1, damping: 1 }}
  />
</div>
<Spacer vertical={10} />
<Toggle label="Full screen:" bind:checked={fullScreenCanvas} on:change={toggleFullScreen} />

<style>
  .flex-row {
    display: flex;
    flex-flow: row nowrap;
    align-items: center;
    margin: 0 0 -15px 0;
  }

  .flex-row label {
    margin: 0 0 9px 0;
    width: 100px;
  }

  :global(.flex-row > .rangeSlider) {
    width: 100%;
  }
</style>
