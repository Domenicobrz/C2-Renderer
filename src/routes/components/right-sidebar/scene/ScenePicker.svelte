<script lang="ts">
  import { globals } from '$lib/C2';
  import type { SceneName } from '$lib/createScene';
  import { selectedSceneStore } from '../../../stores/main';
  import Separator from '../../Separator.svelte';
  import Spacer from '../../Spacer.svelte';
  import SceneEntry from './SceneEntry.svelte';

  const availableScenes: { name: SceneName; thumbnail: string }[] = [
    { name: 'C2 features', thumbnail: globals.assetsPath + 'thumbnails/c2-renderer.jpg' },
    {
      name: 'ReSTIR stress test',
      thumbnail: globals.assetsPath + 'thumbnails/restir-stress-test.jpg'
    },
    { name: 'Cornell sphere', thumbnail: globals.assetsPath + 'thumbnails/cornell-sphere.png' },
    {
      name: 'Envmap + multiscatter dielectric',
      thumbnail: globals.assetsPath + 'thumbnails/envmap-dielectric.png'
    }
  ] as const;

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
