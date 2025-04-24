<script lang="ts">
  import { configOptions, samplesInfo } from '../../stores/main';
  import Folder from '../Folder.svelte';
  import Decorrelation from './Simple-path-trace/Decorrelation.svelte';
  import MisOptions from './Simple-path-trace/MisOptions.svelte';
  import Sampler from './Simple-path-trace/Sampler.svelte';

  function onSampleLimitInputChange(e: Event) {
    const newSampleLimit = parseInt((e.target as HTMLInputElement).value);
    if (isNaN(newSampleLimit)) return;

    samplesInfo.setLimit(newSampleLimit);
  }

  function onOneStepLimitIncrement() {
    samplesInfo.setLimit($samplesInfo.limit + 1);
  }

  function infiniteSamplesLimit() {
    samplesInfo.setLimit(999999);
  }

  function oneSampleLimit() {
    samplesInfo.setLimit(1);
    samplesInfo.reset();
  }
</script>

<span
  >Sample Limit: <input
    class="samples-limit-input"
    type="text"
    value={$samplesInfo.limit}
    on:change={onSampleLimitInputChange}
  /></span
>
<button class="sample-limit-btn" on:click={onOneStepLimitIncrement}>+</button>
<button class="sample-limit-btn" on:click={infiniteSamplesLimit}>∞</button>
<button class="sample-limit-btn" on:click={oneSampleLimit}>1</button>

<style>
  .samples-limit-input {
    width: 50px;
  }

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

  button.sample-limit-btn {
    padding: 4px 8px;
    margin: 0 -3px 0 0;
  }

  button:active {
    background: #333;
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
