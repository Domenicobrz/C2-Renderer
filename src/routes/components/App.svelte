<script lang="ts">
  import { Renderer } from '$lib/C2';
  import { onMount } from 'svelte';
  import { bvhInfo, samplesInfo } from '../stores/main';

  let canvasRef: HTMLCanvasElement;
  let canvasWidth = 800;
  let canvasHeight = 600;

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
    <canvas width={canvasWidth} height={canvasHeight} bind:this={canvasRef} />
  </div>

  <div class="sidebar">
    <br />
    <label>width: </label>
    <input type="range" min="1" max="1500" bind:value={canvasWidth} />
    <br />
    <label>height: </label>
    <input type="range" min="1" max="1000" bind:value={canvasHeight} />
    <br />
    <p>Bvh nodes count: {$bvhInfo.nodesCount}</p>
    <p>Sample: {$samplesInfo.count}</p>
    <div>
      <span
        >Sample Limit: <input
          class="samples-limit-input"
          type="text"
          value={$samplesInfo.limit}
          on:change={onSampleLimitInputChange}
        /></span
      >
      <button on:click={onOneStepLimitIncrement}>+</button>
      <button on:click={infiniteSamplesLimit}>∞</button>
      <button on:click={oneSampleLimit}>1</button>
    </div>
    <button on:click={restart}>restart</button>
    <button on:click={stop}>stop</button>
  </div>
</main>

<style>
  :global(html, body) {
    width: 100%;
    height: 100%;
    margin: 0;
    background: #181818;
  }

  :global(*) {
    box-sizing: border-box;
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
    padding: 20px;
    border: 1px solid #333;
    color: #ddd;
  }

  .samples-limit-input {
    width: 50px;
  }
</style>
