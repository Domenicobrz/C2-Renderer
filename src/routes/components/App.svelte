<script lang="ts">
	import { Renderer } from "$lib/C2";
	import { onMount } from "svelte";

  let canvasRef: HTMLCanvasElement;

  onMount(async () => {
    try {
      const renderer = await Renderer(canvasRef);
    } catch (error) {
      console.error(error);
    }
  });
</script>

<main>
  <canvas width="603" height="603" bind:this={canvasRef}></canvas>
</main>

<style>
  :global(html, body) {
    width: 100%;
    height: 100%;
    margin: 0;
  }

  main {
    width: 100%;
    height: 100%;

    display: flex;
    flex-flow: column nowrap;
    justify-content: center;
    align-items: center;
  }

  canvas {
    border: 1px solid #eee;
  }
</style>