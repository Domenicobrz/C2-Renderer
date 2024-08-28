<script lang="ts">
  import { Renderer } from '$lib/C2';
  import type { RendererInterface } from '$lib/C2';
  import { onMount } from 'svelte';
  import { bvhInfo, configOptions, samplesInfo } from '../stores/main';
  import Folder from './Folder.svelte';
  import MisOptions from './MisOptions.svelte';
  import LeftSidebar from './LeftSidebar.svelte';
  import Envmap from './right-sidebar/Envmap.svelte';
  import CameraSettings from './right-sidebar/CameraSettings.svelte';
  import CanvasSize from './right-sidebar/CanvasSize.svelte';

  let canvasRef: HTMLCanvasElement;
  let canvasWidthSlidersValue: number[];
  let canvasHeightSlidersValue: number[];
  let canvasContainerEl: HTMLDivElement;
  let renderer: RendererInterface;

  onMount(async () => {
    try {
      renderer = await Renderer(canvasRef);
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
  <LeftSidebar />

  <div class="canvas-container" bind:this={canvasContainerEl}>
    <canvas
      width={canvasWidthSlidersValue?.[0]}
      height={canvasHeightSlidersValue?.[0]}
      bind:this={canvasRef}
    />
  </div>

  <div class="sidebar">
    <Folder name="Canvas">
      <CanvasSize
        {canvasContainerEl}
        bind:width={canvasWidthSlidersValue}
        bind:height={canvasHeightSlidersValue}
      />
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
    <Folder name="Camera">
      <CameraSettings {canvasRef} {renderer} />
    </Folder>
    <Folder name="Envmap" disabled={!$configOptions.shaderConfig.HAS_ENVMAP}>
      <Envmap />
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

  p,
  span {
    font-size: 15px;
  }

  p span {
    color: #aaa;
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
    overflow: auto;
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

  button:active {
    background: #333;
  }

  input[type='text'] {
    background: #454545;
    color: #ddd;
    border-radius: 4px;
    padding: 3px 7px;
    border: 1px solid #636363;
    font-size: 12px;
  }

  ::-webkit-scrollbar {
    width: 8px;
  }
  ::-webkit-scrollbar-thumb {
    background: #2f2f2f;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  ::-webkit-scrollbar-track {
    background-color: #191919;
    border: 5px solid #191919;
  }
  ::-webkit-scrollbar-button {
    display: none;
    background-color: #301934;
    background-repeat: no-repeat;
    background-size: 100%;
    background-position: center;
  }
</style>
