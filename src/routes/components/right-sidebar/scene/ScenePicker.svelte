<script lang="ts">
  import { availableScenes, type SceneName } from '$lib/createScene';
  import { selectedSceneStore } from '../../../stores/main';
  import Separator from '../../Separator.svelte';
  import Spacer from '../../Spacer.svelte';
  import SceneEntry from './SceneEntry.svelte';

  function onSceneEntryClick(sceneName: SceneName) {
    selectedSceneStore.set(sceneName);
  }
</script>

<div class="container">
  <header>Scene selector</header>
  <Separator />
  <Spacer vertical={35} />

  {#each availableScenes as scene}
    <SceneEntry
      name={scene.name}
      thumbnailUrl={scene.thumbnail}
      selected={$selectedSceneStore == scene.name}
      on:click={() => onSceneEntryClick(scene.name)}
    />
  {/each}
</div>

<style>
  header {
    font-weight: 700;
    text-align: center;
    margin: 15px 0 5px 0;
  }

  .container {
    margin: 0 15px 20px 15px;
  }
</style>
