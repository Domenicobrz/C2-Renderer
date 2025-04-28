<script lang="ts">
  import { bvhInfo, configOptions, samplesInfo } from '../../stores/main';
  import Separator from '../Separator.svelte';
</script>

<p>Bvh nodes count: <span>{$bvhInfo.nodesCount}</span></p>
<p>Sample: <span>{$samplesInfo.count}</span></p>
<p>Tile: <span>{$samplesInfo.tileSize}</span></p>
<p>
  Performance: <span
    >{$samplesInfo.count == $samplesInfo.limit ? 0 : $samplesInfo.ms.toFixed(0)} ms</span
  >
</p>
<p>Click target: <span class="user-selectable">{$samplesInfo.clickTarget}</span></p>

{#if $configOptions.integrator == 'ReSTIR'}
  <Separator />
  <p>ReSTIR PT State: <span>{$samplesInfo.integrator.ReSTIR?.state}</span></p>
  <p>
    Initial Candidate index: <span>{$samplesInfo.integrator.ReSTIR?.initialCandidateIndex}</span>
  </p>
  <p>Spatial Re-sample index: <span>{$samplesInfo.integrator.ReSTIR?.srPassIndex}</span></p>
{/if}

<style>
  p,
  span {
    font-size: 15px;
  }

  p span {
    color: #aaa;
  }

  .user-selectable {
    user-select: text;
  }
</style>
