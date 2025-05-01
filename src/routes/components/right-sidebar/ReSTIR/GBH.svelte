<script lang="ts">
  import { configOptions } from '../../../stores/main';
  import Spacer from '../../Spacer.svelte';

  let pairWiseOption: typeof $configOptions.ReSTIR.GBH_VARIANT = 'Pairwise MIS';
  let oneOverMOption: typeof $configOptions.ReSTIR.GBH_VARIANT = '1/M Biased';
</script>

<p>(Requires shader recompilation)</p>
<Spacer vertical={10} />
<label>
  <input
    type="radio"
    name="sampler-type"
    value={pairWiseOption}
    bind:group={$configOptions.ReSTIR.GBH_VARIANT}
  />
  Pairwise MIS
</label>
<label>
  <input
    type="radio"
    name="sampler-type"
    value={oneOverMOption}
    bind:group={$configOptions.ReSTIR.GBH_VARIANT}
  />
  1/M Biased
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
