<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    change: { value: boolean };
  }>();

  export let checked = false;
  export let label: string = '';

  function onClick() {
    checked = !checked;
    dispatch('change', { value: checked });
  }
</script>

<div class="container">
  <p>{label}</p>
  <div class="toggle-container" class:checked on:click={onClick}>
    <div class="thumb" class:checked />
  </div>
</div>

<style>
  .container {
    display: flex;
  }

  p {
    font-size: 15px;
    margin: -1px 10px 0 0;
  }

  .toggle-container {
    display: inline-block;
    border: 1px solid #bbb;
    background: #555;
    width: 30px;
    height: 14px;
    border-radius: 8px;
    position: relative;
    cursor: pointer;

    transition: background 0.135s;
  }
  .toggle-container.checked {
    border-color: #afd987;
    background: #afd987;
  }

  .thumb {
    width: 8px;
    height: 8px;
    border-radius: 10px;
    margin: 2px;
    background: #bbb;
    transform: translate(0px, 0px);
    transition: background 0.135s, transform 0.135s;
  }
  .thumb.checked {
    background: #555;
    transform: translate(16px, 0px);
  }
</style>
