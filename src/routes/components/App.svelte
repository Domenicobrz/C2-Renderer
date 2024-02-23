<script lang="ts">
  import { Renderer } from '$lib/C2';
  import { onMount } from 'svelte';
  import { bvhInfo, samplesInfo } from '../stores/main';
  import Folder from './Folder.svelte';
  import RangeSlider from 'svelte-range-slider-pips';
  import MisOptions from './MisOptions.svelte';

  let canvasRef: HTMLCanvasElement;
  let canvasWidthSlidersValue = [800];
  let canvasHeightSlidersValue = [600];

  onMount(async () => {
    try {
      const renderer = await Renderer(canvasRef);
    } catch (error) {
      console.error(error);
    }
  });

  function restart() {
    samplesInfo.reset();
  }

  function onSampleLimitInputChange(e: Event) {
    const newSampleLimit = parseInt((e.target as HTMLInputElement).value);
    if (isNaN(newSampleLimit)) return;

    samplesInfo.setLimit(newSampleLimit);
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
  <div class="canvas-container">
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
          max={1500}
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
          max={1000}
          bind:values={canvasHeightSlidersValue}
          pips
          float
          pipstep={100}
          springValues={{ stiffness: 1, damping: 1 }}
        />
      </div>
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
  }

  canvas {
    margin: auto;
    display: block;
  }

  .sidebar {
    flex: 0 0 300px;
    height: 100%;
    border: 1px solid #333;
    color: #ddd;
    background: #191919;
  }

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
