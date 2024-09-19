<script lang="ts">
  import { Renderer } from '$lib/C2';
  import type { RendererInterface } from '$lib/C2';
  import { onMount } from 'svelte';
  import { configOptions } from '../stores/main';
  import Folder from './Folder.svelte';
  import LeftSidebar from './LeftSidebar.svelte';
  import Envmap from './right-sidebar/Envmap.svelte';
  import CameraSettings from './right-sidebar/CameraSettings.svelte';
  import CanvasSize from './right-sidebar/CanvasSize.svelte';
  import Sampling from './right-sidebar/Sampling.svelte';
  import Info from './right-sidebar/Info.svelte';
  import Operate from './right-sidebar/Operate.svelte';
  import Performance from './right-sidebar/Performance.svelte';

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
</script>

<main>
  <LeftSidebar />

  <div class="canvas-container" bind:this={canvasContainerEl}>
    <canvas width={canvasWidth || 1} height={canvasHeight || 1} bind:this={canvasRef} />
  </div>

  <div class="sidebar">
    <Folder name="Canvas">
      <CanvasSize {canvasContainerEl} bind:width={canvasWidth} bind:height={canvasHeight} />
    </Folder>
    <Folder name="Info">
      <Info />
    </Folder>
    <Folder name="Camera">
      <CameraSettings {canvasRef} {renderer} />
    </Folder>
    <Folder name="Envmap" disabled={!$configOptions.shaderConfig.HAS_ENVMAP}>
      <Envmap />
    </Folder>
    <Folder name="Sampling" roundBox>
      <Sampling />
    </Folder>
    <Folder name="Performance" expanded={false}>
      <Performance />
    </Folder>
    <Folder name="Operate" roundBox>
      <Operate />
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
    flex: 0 0 310px;
    height: 100%;
    border: 1px solid #333;
    color: #ddd;
    background: #191919;
    overflow: auto;
  }
</style>
