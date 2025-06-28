<script lang="ts">
  import { ReSTIR_SAMPLER_TYPE } from '$lib/config';
  import { configOptions } from '../../../stores/main';
</script>

<label>
  <input
    type="radio"
    name="ReSTIR-sampler-type"
    value={ReSTIR_SAMPLER_TYPE.UNIFORM}
    bind:group={$configOptions.ReSTIR.SAMPLER_TYPE}
  />
  Uniform random
</label>
<label>
  <input
    type="radio"
    name="ReSTIR-sampler-type"
    value={ReSTIR_SAMPLER_TYPE.HALTON_2_THEN_UNIFORM}
    bind:group={$configOptions.ReSTIR.SAMPLER_TYPE}
  />
  2 Halton, then uniform
</label>
<label>
  <input
    type="radio"
    name="ReSTIR-sampler-type"
    value={ReSTIR_SAMPLER_TYPE.BLUE_NOISE}
    bind:group={$configOptions.ReSTIR.SAMPLER_TYPE}
  />
  Blue Noise
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
