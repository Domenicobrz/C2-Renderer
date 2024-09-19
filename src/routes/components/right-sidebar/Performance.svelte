<script>
  import RangeSlider from 'svelte-range-slider-pips';
  import { configOptions } from '../../stores/main';
  import Toggle from '../Toggle.svelte';
  import Spacer from '../Spacer.svelte';

  let sliderBounces = [$configOptions.BOUNCES_COUNT];

  $: {
    $configOptions.BOUNCES_COUNT = sliderBounces[0];
  }
</script>

<div class="flex-row">
  <label>Light bounces: </label>
  <RangeSlider
    min={1}
    max={10}
    bind:values={sliderBounces}
    pips
    float
    pipstep={1}
    springValues={{ stiffness: 1, damping: 1 }}
  />
</div>
<Spacer vertical={10} />
<Toggle label="Force max tile size:" bind:checked={$configOptions.forceMaxTileSize} />

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
</style>
