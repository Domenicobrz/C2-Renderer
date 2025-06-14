<script lang="ts">
  import { configOptions } from '../stores/main';
  import Folder from './Folder.svelte';
  import GearIcon from './icons/GearIcon.svelte';
  import SceneIcon from './icons/SceneIcon.svelte';
  import AdapterInfo from './right-sidebar/AdapterInfo.svelte';
  import CameraSettings from './right-sidebar/CameraSettings.svelte';
  import CanvasSize from './right-sidebar/CanvasSize.svelte';
  import Envmap from './right-sidebar/Envmap.svelte';
  import Info from './right-sidebar/Info.svelte';
  import Integrator from './right-sidebar/Integrator.svelte';
  import Operate from './right-sidebar/Operate.svelte';
  import Performance from './right-sidebar/Performance.svelte';
  import Sampling from './right-sidebar/Sampling.svelte';
  import ScenePicker from './right-sidebar/scene/ScenePicker.svelte';
  import Spacer from './Spacer.svelte';
  import VerticalToolbar from './VerticalToolbar.svelte';

  export let canvasContainerEl;
  export let canvasWidth: number;
  export let canvasHeight: number;
  export let canvasRef;
  export let renderer;

  let activePanel: 'settings' | 'scene' = 'settings';
</script>

<div class="container">
  <VerticalToolbar side="right">
    <Spacer vertical={2} />
    <button class:active={activePanel === 'settings'} on:click={() => (activePanel = 'settings')}>
      <GearIcon />
    </button>
    <Spacer vertical={2} />
    <button class:active={activePanel === 'scene'} on:click={() => (activePanel = 'scene')}>
      <SceneIcon />
    </button>
  </VerticalToolbar>

  <div class="menu-settings">
    <div style:display={activePanel == 'settings' ? 'block' : 'none'}>
      <Folder name="Canvas">
        <CanvasSize {canvasContainerEl} bind:width={canvasWidth} bind:height={canvasHeight} />
      </Folder>
      <Folder name="Info">
        <Info />
      </Folder>
      <Folder name="Sampling" roundBox>
        <Sampling />
      </Folder>
      <Folder name="Camera">
        <CameraSettings {canvasRef} {renderer} />
      </Folder>
      <Folder name="Envmap" disabled={!$configOptions.shaderConfig.HAS_ENVMAP}>
        <Envmap />
      </Folder>
      <Folder name="Integrator">
        <Integrator />
      </Folder>
      <Folder name="Performance" expanded={false}>
        <Performance />
      </Folder>
      <Folder name="Adapter Info" expanded={false}>
        <AdapterInfo />
      </Folder>
      <Folder name="Operate" roundBox>
        <Operate {renderer} />
      </Folder>
    </div>

    <div style:display={activePanel == 'scene' ? 'block' : 'none'}>
      <ScenePicker />
    </div>
  </div>
</div>

<style>
  .container {
    display: flex;
    flex-flow: row nowrap;
    height: 100%;
  }

  .menu-settings {
    flex: 0 0 310px;
    height: 100%;
    border: 1px solid #333;
    color: #ddd;
    background: #191919;
    overflow: auto;
  }
</style>
