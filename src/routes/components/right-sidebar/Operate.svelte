<script lang="ts">
  import type { RendererInterface } from '$lib/C2';
  import { samplesInfo } from '../../stores/main';

  export let renderer: RendererInterface;

  function restart() {
    renderer.restart();
  }

  function stop() {
    samplesInfo.setLimit($samplesInfo.count);
  }
</script>

<button on:click={restart}>restart</button>
<button on:click={stop}>stop</button>

<style>
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

  button:active {
    background: #333;
  }
</style>
