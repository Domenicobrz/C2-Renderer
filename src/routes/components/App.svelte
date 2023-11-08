<script lang="ts">
	import { Renderer } from '$lib/C2';
	import { onMount } from 'svelte';

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
</script>

<main>
	<canvas width={canvasWidth} height={canvasHeight} bind:this={canvasRef} />

	<div>
		<br />
		<label>width: </label>
		<input type="range" min="1" max="1000" bind:value={canvasWidth} />
		<br />
		<label>height: </label>
		<input type="range" min="1" max="1000" bind:value={canvasHeight} />
	</div>
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
