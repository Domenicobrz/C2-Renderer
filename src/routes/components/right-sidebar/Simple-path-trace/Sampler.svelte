<script lang="ts">
  import { SAMPLER_TYPE } from '$lib/config';
  import { configOptions } from '../../../stores/main';
  import Separator from '../../Separator.svelte';
</script>

<label>
  <input
    type="radio"
    name="sampler-type"
    value={SAMPLER_TYPE.UNIFORM}
    bind:group={$configOptions.SimplePathTrace.SAMPLER_TYPE}
  />
  Uniform random
</label>
<label>
  <input
    type="radio"
    name="sampler-type"
    value={SAMPLER_TYPE.HALTON}
    bind:group={$configOptions.SimplePathTrace.SAMPLER_TYPE}
  />
  Halton sequence
</label>
<label>
  <input
    type="radio"
    name="sampler-type"
    value={SAMPLER_TYPE.BLUE_NOISE}
    bind:group={$configOptions.SimplePathTrace.SAMPLER_TYPE}
  />
  Blue Noise
</label>
<label>
  <input
    type="radio"
    name="sampler-type"
    value={SAMPLER_TYPE.CUSTOM_R2}
    bind:group={$configOptions.SimplePathTrace.SAMPLER_TYPE}
  />
  Sequenced R2
</label>

<style>
  p {
    font-size: 14px;
  }

  label {
    font-size: 13px;
    display: block;
  }

  label ~ label {
    margin: 10px 0 0 0;
  }

  input[type='radio'] {
    background: #555;
    /* border: 1px solid #888; */
    border-radius: 3px;
    width: 15px;
    height: 15px;
    appearance: none;
    display: inline-grid;
    transform: translate(0px, -2px);
  }

  input[type='radio']::before {
    content: ' ';
    width: 7px;
    height: 7px;
    margin: 4px;
    border-radius: 2px;
    transform: scale(0);
    background: #bbb;
  }

  input[type='radio']:checked::before {
    transform: scale(1);
  }
</style>
