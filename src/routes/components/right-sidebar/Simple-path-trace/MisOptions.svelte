<script lang="ts">
  import { MIS_TYPE } from '$lib/config';
  import { configOptions } from '../../../stores/main';
  import Separator from '../../Separator.svelte';
</script>

<p>Mis Type:</p>
<Separator />

<label>
  <input
    type="radio"
    name="mis-type"
    value={MIS_TYPE.BRDF_ONLY}
    bind:group={$configOptions.SimplePathTrace.MIS_TYPE}
  />
  Brdf only
</label>
<label>
  <input
    type="radio"
    name="mis-type"
    value={MIS_TYPE.NEXT_EVENT_ESTIMATION}
    bind:group={$configOptions.SimplePathTrace.MIS_TYPE}
  />
  Next Event Estimation
</label>

<br />
<br />
<p>Method:</p>
<Separator />
<label>
  <input
    type="radio"
    name="mis-heuristic"
    value={0}
    bind:group={$configOptions.SimplePathTrace.USE_POWER_HEURISTIC}
  />
  Balanced Heuristic
</label>
<label>
  <input
    type="radio"
    name="mis-heuristic"
    value={1}
    bind:group={$configOptions.SimplePathTrace.USE_POWER_HEURISTIC}
  />
  Power Heuristic
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
