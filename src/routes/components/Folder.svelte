<script lang="ts">
  import { onMount } from 'svelte';

  export let name: string;
  export let expanded = true;
  export let roundBox = false;

  let childOfAnotherFolder = false;

  let containerEl: HTMLDivElement;

  onMount(() => {
    console.log(containerEl!.parentElement);
    if (containerEl) {
      const parentEl = containerEl.parentElement;
      if (parentEl && parentEl.classList.contains('folder-slot-container')) {
        childOfAnotherFolder = true;
      }
    }
  });

  function expandToggle() {
    expanded = !expanded;
  }
</script>

<div class="container" class:roundBox bind:this={containerEl} class:childOfAnotherFolder>
  <header class:expanded>
    <button on:click={expandToggle}>{expanded ? '-' : '+'}</button>
    <p on:click={expandToggle}>{name}</p>
  </header>
  <div class="folder-slot-container" class:expanded>
    <slot />
  </div>
</div>

<style>
  .container {
    margin: 8px;
  }
  .container.roundBox {
    border: 1px dashed #444;
    border-radius: 8px;
    overflow: hidden;
  }
  .container.childOfAnotherFolder {
    margin: 16px 0 0 0;
  }
  .folder-slot-container {
    overflow: hidden;
    height: 0px;
  }
  .folder-slot-container.expanded {
    padding: 13px;
    height: auto;
  }
  header {
    display: flex;
    flex-flow: row nowrap;
    align-items: center;
    background: #2f2f2f;
    cursor: pointer;
    font-weight: 700;
    font-size: 15px;
  }
  header.expanded {
    border-bottom: 1px solid #4f4f4f;
  }

  header button {
    padding: 5px 10px;
    background: none;
    border: none;
    color: #ddd;
    width: 20px;
  }
  header p {
    text-align: center;
    flex: 1 0 auto;
    color: #ddd;
    padding: 5px 0;
  }
</style>
