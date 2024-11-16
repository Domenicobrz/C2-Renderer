<script lang="ts">
  import { SAMPLER_CORRELATION_FIX, SAMPLER_TYPE } from '$lib/config';
  import { configOptions } from '../../stores/main';
  import Warning from '../icons/Warning.svelte';
  import Separator from '../Separator.svelte';

  $: haltonRAOperformanceWarning =
    $configOptions.SAMPLER_CORRELATION_FIX == SAMPLER_CORRELATION_FIX.RANDOM_ARRAY_OFFSET &&
    $configOptions.SAMPLER_TYPE == SAMPLER_TYPE.HALTON;
</script>

<label>
  <input
    type="radio"
    name="correlation-fix-type"
    value={SAMPLER_CORRELATION_FIX.NONE}
    bind:group={$configOptions.SAMPLER_CORRELATION_FIX}
  />
  <p>None</p>
</label>
<label>
  <input
    type="radio"
    name="correlation-fix-type"
    value={SAMPLER_CORRELATION_FIX.RANDOM_OFFSET}
    bind:group={$configOptions.SAMPLER_CORRELATION_FIX}
  />
  <p>Add random value</p>
</label>
<label>
  <input
    type="radio"
    name="correlation-fix-type"
    value={SAMPLER_CORRELATION_FIX.RANDOM_ARRAY_OFFSET}
    bind:group={$configOptions.SAMPLER_CORRELATION_FIX}
  />
  <p>Add random value and random array offset</p>
</label>

{#if haltonRAOperformanceWarning}
  <Separator topSpace={10} bottomSpace={10} />
  <h6 class="warning">
    <Warning />Using random-array-offset with the Halton sampler results in poor sampling
    performance
  </h6>
{/if}

<style>
  :global(h6.warning svg) {
    flex: 0 0 20px;
    display: inline-block;
    margin: 0 5px 0 0;
  }

  h6.warning {
    display: flex;
    align-items: center;
    margin: 5px 0 0 0;
    font-size: 14px;
    color: #cb8933;
  }

  p {
    margin: 0 0 0 6px;
  }

  label {
    font-size: 13px;
    display: flex;
    align-items: center;
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
