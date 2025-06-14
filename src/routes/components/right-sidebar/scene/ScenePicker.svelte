<script lang="ts">
  import Separator from '../../Separator.svelte';
  import Spacer from '../../Spacer.svelte';
  import SceneEntry from './SceneEntry.svelte';
</script>

<div class="container">
  <header>Scene selector</header>
  <Separator />
  <Spacer vertical={35} />

  <SceneEntry name="C2 Features" thumbnailUrl="scene-assets-TO-REMOVE/thumbnails/c2-renderer.jpg" />
  <SceneEntry
    name="Cornell sphere"
    thumbnailUrl="scene-assets-TO-REMOVE/thumbnails/cornell-sphere.png"
  />
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
