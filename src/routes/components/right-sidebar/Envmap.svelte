<script lang="ts">
  import RangeSlider from 'svelte-range-slider-pips';
  import { configOptions } from '../../stores/main';
  import Spacer from '../Spacer.svelte';
  import Checkbox from '../Checkbox.svelte';

  function onEnvmapScaleChange(e: Event) {
    const newScale = parseFloat((e.target as HTMLInputElement).value);
    if (isNaN(newScale)) return;

    $configOptions.ENVMAP_SCALE = newScale;
  }

  function onEnvmapRotXChange(e: { detail: { value: number } }) {
    const newRotX = e.detail.value;
    if (isNaN(newRotX)) return;

    $configOptions.ENVMAP_ROTX = newRotX;
  }

  function onEnvmapRotYChange(e: { detail: { value: number } }) {
    const newRotY = e.detail.value;
    if (isNaN(newRotY)) return;

    $configOptions.ENVMAP_ROTY = newRotY;
  }
</script>

<span
  >Scale: <input
    class="envmap-scale-input"
    type="text"
    value={$configOptions.ENVMAP_SCALE}
    on:change={onEnvmapScaleChange}
  /></span
>
<div class="flex-row">
  <label class="large no-margin">Rotation X: </label>
  <RangeSlider
    min={0}
    max={Math.PI * 2}
    on:change={onEnvmapRotXChange}
    float
    values={[$configOptions.ENVMAP_ROTX]}
    step={0.1}
    springValues={{ stiffness: 1, damping: 1 }}
  />
</div>
<Spacer vertical={5} />
<div class="flex-row">
  <label class="large no-margin">Rotation Y: </label>
  <RangeSlider
    min={0}
    max={Math.PI * 2}
    on:change={onEnvmapRotYChange}
    float
    values={[$configOptions.ENVMAP_ROTY]}
    step={0.1}
    springValues={{ stiffness: 1, damping: 1 }}
  />
</div>
<Spacer vertical={12} />
<div class="flex-row">
  <p>Use compensated distribution:&nbsp;</p>
  <Checkbox bind:checked={$configOptions.ENVMAP_USE_COMPENSATED_DISTRIBUTION} />
</div>
<Spacer vertical={8} />

<style>
  p,
  span,
  label {
    font-size: 15px;
  }

  .flex-row {
    display: flex;
    flex-flow: row nowrap;
    align-items: center;
    margin: 0 0 -15px 0;
  }

  .flex-row label {
    margin: 0 0 9px 0;
    width: 100px;
  }

  .flex-row label.large {
    margin: 0 0 9px 0;
    width: 150px;
  }

  .flex-row label.no-margin {
    margin: 0;
  }

  .envmap-scale-input {
    width: 50px;
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
