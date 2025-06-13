<script lang="ts">
  import { Renderer } from '$lib/C2';
  import type { RendererInterface } from '$lib/C2';
  import { onMount } from 'svelte';
  import { centralErrorStatusMessage, centralStatusMessage, samplesInfo } from '../stores/main';
  import LeftSidebar from './LeftSidebar.svelte';
  import StopWatch from './icons/StopWatch.svelte';
  import RightSidebar from './RightSidebar.svelte';

  let canvasRef: HTMLCanvasElement;
  let canvasWidth: number;
  let canvasHeight: number;
  let canvasContainerEl: HTMLDivElement;
  let renderer: RendererInterface;

  onMount(async () => {
    try {
      renderer = await Renderer(canvasRef);
    } catch (error) {
      console.error(error);
    }
  });

  function onCanvasClick(e: MouseEvent & { currentTarget: EventTarget & HTMLCanvasElement }) {
    $samplesInfo.clickTarget = `(${e.offsetX}, ${canvasHeight - e.offsetY})`;
  }
</script>

<main>
  <LeftSidebar />

  <div class="canvas-container" bind:this={canvasContainerEl}>
    <canvas
      width={canvasWidth || 1}
      height={canvasHeight || 1}
      bind:this={canvasRef}
      on:click={onCanvasClick}
    />

    {#if $centralStatusMessage}
      <div class="csm-dialog">
        <p>
          <span class="csm-icon-container"><StopWatch /></span>{$centralStatusMessage}
        </p>
      </div>
    {/if}

    {#if $centralErrorStatusMessage}
      <div class="csm-dialog">
        <p class="csm csm-error">
          {$centralErrorStatusMessage}
        </p>
      </div>
    {/if}
  </div>

  <RightSidebar bind:canvasWidth bind:canvasHeight {renderer} {canvasContainerEl} {canvasRef} />
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

  main {
    width: 100%;
    height: 100%;

    display: flex;
    flex-flow: row nowrap;
    justify-content: center;
    align-items: center;
  }

  .canvas-container {
    position: relative;
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

  .csm-dialog {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #ddd;

    background: #0e0e0e;
    padding: 20px 40px 25px 40px;
    border-radius: 5px;
    border: 1px solid #333;
  }

  .csm-error {
    color: rgb(171, 0, 0);
  }

  .csm-icon-container {
    display: inline-block;
    width: 20px;
    height: 20px;
    margin: 0px 12px 0 0;
    transform: translateY(5px);
  }
</style>
