<script lang="ts">
  export let side: 'left' | 'right';
</script>

<div class={`vertical-toolbar-container ${side}`}>
  <slot />
</div>

<style>
  .vertical-toolbar-container {
    flex: 0 0 35px;
    display: flex;
    flex-flow: column nowrap;

    height: 100%;
    color: #ddd;
    background: #141414;

    padding: 10px 7px 7px 7px;
  }

  .vertical-toolbar-container.left {
    border-right: 1px solid #333;
  }

  .vertical-toolbar-container.right {
    border-left: 1px solid #333;
  }

  :global(.vertical-toolbar-container button) {
    width: 21px;
    height: 21px;
    background: transparent;
    border: none;
    padding: 0px;
    margin: 0 0 8px 0;
    cursor: pointer;
  }
  :global(.vertical-toolbar-container button > svg) {
    fill: #666;
  }
  :global(.vertical-toolbar-container button.active > svg) {
    fill: #bbb;
  }
</style>
