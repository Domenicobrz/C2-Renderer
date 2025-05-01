<script lang="ts">
  import { configOptions } from '../../stores/main';
  import Folder from '../Folder.svelte';
  import Separator from '../Separator.svelte';
  import Spacer from '../Spacer.svelte';
  import ReSTIRPTParams from './ReSTIR/ReSTIRPTParams.svelte';
  import Decorrelation from './Simple-path-trace/Decorrelation.svelte';
  import MisOptions from './Simple-path-trace/MisOptions.svelte';
  import Sampler from './Simple-path-trace/Sampler.svelte';
  import ReSTIRSampler from './ReSTIR/Sampler.svelte';
  import GBH from './ReSTIR/GBH.svelte';
</script>

<p>Integrator Type:</p>
<Separator />
<label>
  <input
    type="radio"
    name="integrator"
    value={'Simple-path-trace'}
    bind:group={$configOptions.integrator}
  />
  Simple path trace
</label>
<label>
  <input type="radio" name="integrator" value={'ReSTIR'} bind:group={$configOptions.integrator} />
  ReSTIR PT
</label>

<Spacer vertical={30} />
<p>Integrator Options:</p>
<Separator />

{#if $configOptions.integrator == 'Simple-path-trace'}
  <Folder name="Sampler" roundBox withBorder>
    <Sampler />
  </Folder>

  <Folder name="Pixel decorrelation" roundBox withBorder>
    <Decorrelation />
  </Folder>

  <Folder name="Mis Options" roundBox withBorder>
    <MisOptions />
  </Folder>
{/if}

{#if $configOptions.integrator == 'ReSTIR'}
  <Folder name="ReSTIR PT Params">
    <ReSTIRPTParams />
  </Folder>
  <Folder name="Spatial-reuse sampler">
    <ReSTIRSampler />
  </Folder>
  <Folder name="Generalized Balance Heuristic">
    <GBH />
  </Folder>
{/if}

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
