<script lang="ts">
  import RangeSlider from 'svelte-range-slider-pips';
  import { configOptions } from '../../../stores/main';
  import Toggle from '../../Toggle.svelte';
  import Spacer from '../../Spacer.svelte';

  let maxConfidence = [$configOptions.ReSTIR.MAX_CONFIDENCE];
  let srCandidates = [$configOptions.ReSTIR.RESTIR_SR_CANDIDATES];
  let srPassCount = [$configOptions.ReSTIR.RESTIR_SR_PASS_COUNT];
  $: {
    $configOptions.ReSTIR.RESTIR_SR_CANDIDATES = srCandidates[0];
    $configOptions.ReSTIR.RESTIR_SR_PASS_COUNT = srPassCount[0];
    $configOptions.ReSTIR.MAX_CONFIDENCE = maxConfidence[0];
    $configOptions = $configOptions;
  }
</script>

<span
  >Initial Candidates: <input
    class="initial-candidates"
    type="text"
    bind:value={$configOptions.ReSTIR.RESTIR_INITIAL_CANDIDATES}
  /></span
>
<Spacer vertical={12} />
<span
  >Spatial-reuse radius: <input
    class="initial-candidates"
    type="text"
    bind:value={$configOptions.ReSTIR.SR_CIRCLE_RADIUS}
  /></span
>
<Spacer vertical={14} />
<Toggle label="Use temporal resample:" bind:checked={$configOptions.ReSTIR.USE_TEMPORAL_RESAMPLE} />
<Spacer vertical={5} />
<div class="flex-row">
  <label>Max confidence: </label>
  <RangeSlider
    min={1}
    max={20}
    bind:values={maxConfidence}
    pips
    float
    pipstep={1}
    springValues={{ stiffness: 1, damping: 1 }}
  />
</div>
<div class="flex-row">
  <label>Spatial-reuse candidates: </label>
  <RangeSlider
    min={1}
    max={6}
    bind:values={srCandidates}
    pips
    float
    pipstep={1}
    springValues={{ stiffness: 1, damping: 1 }}
  />
</div>
<Spacer vertical={5} />
<div class="flex-row">
  <label>Spatial-reuse passes: </label>
  <RangeSlider
    min={1}
    max={6}
    bind:values={srPassCount}
    pips
    float
    pipstep={1}
    springValues={{ stiffness: 1, damping: 1 }}
  />
</div>

<style>
  .flex-row {
    display: flex;
    flex-flow: row nowrap;
    align-items: center;
    margin: 0 0 -15px 0;
  }

  .flex-row label {
    margin: 0 0 9px 0;
    width: 210px;
    font-size: 15px;
  }

  .initial-candidates {
    width: 50px;
  }

  p,
  span {
    font-size: 15px;
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
