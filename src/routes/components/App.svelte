<script lang="ts">
  import { Renderer, onClick } from '$lib/C2';
  import { onMount } from 'svelte';
  import { bvhInfo, configOptions, samplesInfo } from '../stores/main';
  import Folder from './Folder.svelte';
  import RangeSlider from 'svelte-range-slider-pips';
  import MisOptions from './MisOptions.svelte';
  import Toggle from './Toggle.svelte';
  import Spacer from './Spacer.svelte';
  import { configManager } from '$lib/config';
  import Checkbox from './Checkbox.svelte';

  let canvasRef: HTMLCanvasElement;
  let canvasWidthSlidersValue = [0];
  let canvasHeightSlidersValue = [0];
  let canvasContainerEl: HTMLDivElement;
  let fullScreenCanvas = false;
  let maxCanvasSize = 0;

  onMount(async () => {
    setMaxCanvasSize();
    canvasWidthSlidersValue = [800];
    canvasHeightSlidersValue = [600];

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

    try {
      const renderer = await Renderer(canvasRef);
    } catch (error) {
      console.error(error);
    }

    window.addEventListener('keypress', (e) => {
      if (e.key == 'k') {
        onClick();
      }
    });
  });

  function setMaxCanvasSize() {
    maxCanvasSize = Math.floor(Math.max(innerHeight, innerWidth) * 1.0);
  }

  function setFullScreenCanvasSize() {
    const cr = canvasContainerEl.getBoundingClientRect();
    canvasWidthSlidersValue = [cr.width - 30];
    canvasHeightSlidersValue = [cr.height - 30];
  }

  function toggleFullScreen() {
    if (fullScreenCanvas) {
      setFullScreenCanvasSize();
    }
  }

  function restart() {
    samplesInfo.reset();
  }

  function onSampleLimitInputChange(e: Event) {
    const newSampleLimit = parseInt((e.target as HTMLInputElement).value);
    if (isNaN(newSampleLimit)) return;

    samplesInfo.setLimit(newSampleLimit);
  }

  function onEnvmapScaleChange(e: Event) {
    const newScale = parseFloat((e.target as HTMLInputElement).value);
    if (isNaN(newScale)) return;

    configManager.setStoreProperty({ ENVMAP_SCALE: newScale });
  }

  function onEnvmapRotXChange(e: { detail: { value: number } }) {
    const newRotX = e.detail.value;
    if (isNaN(newRotX)) return;

    configManager.setStoreProperty({ ENVMAP_ROTX: newRotX });
  }

  function onEnvmapRotYChange(e: { detail: { value: number } }) {
    const newRotY = e.detail.value;
    if (isNaN(newRotY)) return;

    configManager.setStoreProperty({ ENVMAP_ROTY: newRotY });
  }

  function onOneStepLimitIncrement() {
    samplesInfo.setLimit($samplesInfo.limit + 1);
  }

  function stop() {
    samplesInfo.setLimit($samplesInfo.count);
  }

  function infiniteSamplesLimit() {
    samplesInfo.setLimit(999999);
  }

  function oneSampleLimit() {
    samplesInfo.setLimit(1);
    samplesInfo.reset();
  }
</script>

<main>
  <div class="canvas-container" bind:this={canvasContainerEl}>
    <canvas
      width={canvasWidthSlidersValue[0]}
      height={canvasHeightSlidersValue[0]}
      bind:this={canvasRef}
    />
  </div>

  <div class="sidebar">
    <Folder name="Canvas">
      <div class="flex-row">
        <label>width: </label>
        <RangeSlider
          min={1}
          max={maxCanvasSize}
          bind:values={canvasWidthSlidersValue}
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
          bind:values={canvasHeightSlidersValue}
          pips
          float
          pipstep={100}
          springValues={{ stiffness: 1, damping: 1 }}
        />
      </div>
      <Spacer vertical={10} />
      <Toggle label="Full screen:" bind:checked={fullScreenCanvas} on:change={toggleFullScreen} />
    </Folder>
    <Folder name="Info">
      <p>Bvh nodes count: <span>{$bvhInfo.nodesCount}</span></p>
      <p>Sample: <span>{$samplesInfo.count}</span></p>
      <p>Tile: <span>{$samplesInfo.tileSize}</span></p>
      <p>
        Performance: <span
          >{$samplesInfo.count == $samplesInfo.limit ? 0 : $samplesInfo.ms.toFixed(0)} ms</span
        >
      </p>
    </Folder>
    <Folder name="Envmap" disabled={!$configOptions.shaderConfig.HAS_ENVMAP}>
      <span
        >Scale: <input
          class="envmap-scale-input"
          type="text"
          value={$configOptions.ENVMAP_SCALE}
          on:change={onEnvmapScaleChange}
        /></span
      >
      <div class="flex-row">
        <label class="large no-margin">Rotation X: </label>
        <RangeSlider
          min={0}
          max={Math.PI * 2}
          on:change={onEnvmapRotXChange}
          float
          values={[$configOptions.ENVMAP_ROTX]}
          step={0.1}
          springValues={{ stiffness: 1, damping: 1 }}
        />
      </div>
      <Spacer vertical={5} />
      <div class="flex-row">
        <label class="large no-margin">Rotation Y: </label>
        <RangeSlider
          min={0}
          max={Math.PI * 2}
          on:change={onEnvmapRotYChange}
          float
          values={[$configOptions.ENVMAP_ROTY]}
          step={0.1}
          springValues={{ stiffness: 1, damping: 1 }}
        />
      </div>
      <Spacer vertical={12} />
      <div class="flex-row">
        <p>Use compensated distribution:&nbsp;</p>
        <Checkbox bind:checked={$configOptions.ENVMAP_USE_COMPENSATED_DISTRIBUTION} />
      </div>
      <Spacer vertical={8} />
    </Folder>
    <Folder name="Sampling" roundBox>
      <span
        >Sample Limit: <input
          class="samples-limit-input"
          type="text"
          value={$samplesInfo.limit}
          on:change={onSampleLimitInputChange}
        /></span
      >
      <button class="sample-limit-btn" on:click={onOneStepLimitIncrement}>+</button>
      <button class="sample-limit-btn" on:click={infiniteSamplesLimit}>∞</button>
      <button class="sample-limit-btn" on:click={oneSampleLimit}>1</button>

      <Folder name="Mis Options" roundBox>
        <MisOptions />
      </Folder>
    </Folder>
    <Folder name="Operate" roundBox>
      <button on:click={restart}>restart</button>
      <button on:click={stop}>stop</button>
    </Folder>
  </div>
</main>

<style>
  :global(html, body) {
    width: 100%;
    height: 100%;
    margin: 0;
    background: #0e0e0e;
    font-family: 'Inconsolata';
  }

  :global(*) {
    box-sizing: border-box;
  }

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

  .flex-row label.large {
    margin: 0 0 9px 0;
    width: 150px;
  }

  .flex-row label.no-margin {
    margin: 0;
  }

  :global(.flex-row > .rangeSlider) {
    width: 100%;
  }

  p,
  span,
  label {
    font-size: 15px;
  }

  p span {
    color: #aaa;
  }

  @font-face {
    font-family: 'Inconsolata';
    src: url('/fonts/Inconsolata-Light.ttf') format('truetype');
    font-weight: 300;
  }
  @font-face {
    font-family: 'Inconsolata';
    src: url('/fonts/Inconsolata-Regular.ttf') format('truetype');
    font-weight: 400;
  }
  @font-face {
    font-family: 'Inconsolata';
    src: url('/fonts/Inconsolata-Medium.ttf') format('truetype');
    font-weight: 500;
  }
  @font-face {
    font-family: 'Inconsolata';
    src: url('/fonts/Inconsolata-Bold.ttf') format('truetype');
    font-weight: 700;
  }

  main {
    width: 100%;
    height: 100%;

    display: flex;
    flex-flow: row nowrap;
    justify-content: center;
    align-items: center;
  }

  .canvas-container {
    flex: 1 0 0;
    max-width: calc(100% - 300px);
    overflow: auto;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  canvas {
    display: block;
  }

  .sidebar {
    flex: 0 0 300px;
    height: 100%;
    border: 1px solid #333;
    color: #ddd;
    background: #191919;
  }

  .samples-limit-input,
  .envmap-scale-input {
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

  button.sample-limit-btn {
    padding: 4px 8px;
    margin: 0 -3px 0 0;
  }

  input[type='text'] {
    background: #454545;
    color: #ddd;
    border-radius: 4px;
    padding: 3px 7px;
    border: 1px solid #636363;
    font-size: 12px;
  }
</style>
