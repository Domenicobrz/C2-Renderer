<script lang="ts">
  export let name: string;
  export let expanded = true;

  function expandToggle() {
    expanded = !expanded;
  }
</script>

<div class="container">
  <header>
    <button on:click={expandToggle}>{expanded ? '-' : '+'}</button>
    <p on:click={expandToggle}>{name}</p>
  </header>
  <div class="slot-container" class:expanded>
    <slot />
  </div>
</div>

<style>
  .container {
  }
  .slot-container {
    overflow: hidden;
    height: 0px;
  }
  .slot-container.expanded {
    padding: 10px 20px;
    height: auto;
  }
  header {
    display: flex;
    flex-flow: row nowrap;
    align-items: center;
    background: #2f2f2f;
    border-bottom: 1px solid #4f4f4f;
    cursor: pointer;
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
