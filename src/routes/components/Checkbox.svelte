<script lang="ts">
  export let checked: boolean;
</script>

<input type="checkbox" bind:checked />

<style>
  /* Basic styling */
  [type='checkbox'] {
    width: 1.2rem;
    height: 1.2rem;
    color: dodgerblue;
    vertical-align: middle;
    -webkit-appearance: none;
    background: none;
    border: 0;
    outline: 0;
    flex-grow: 0;
    border-radius: 3px;
    background-color: #ffffff;
    transition: background 300ms;
    cursor: pointer;
  }

  /* Pseudo element for check styling */
  [type='checkbox']::before {
    content: '';
    color: transparent;
    display: block;
    width: inherit;
    height: inherit;
    border-radius: inherit;
    border: 0;
    background-color: transparent;
    background-size: contain;
    box-shadow: inset 0 0 0 1px #ccd3d8;
  }

  /* Checked */
  [type='checkbox']:checked {
    background-color: currentcolor;
  }

  [type='checkbox']:checked::before {
    box-shadow: none;
    /* original viewBox was 0 0 24 24 */
    /* original viewBox was 0 0 24 24 */
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='3 3 18 18'%3E %3Cpath d='M15.88 8.29L10 14.17l-1.88-1.88a.996.996 0 1 0-1.41 1.41l2.59 2.59c.39.39 1.02.39 1.41 0L17.3 9.7a.996.996 0 0 0 0-1.41c-.39-.39-1.03-.39-1.42 0z' fill='%23fff'/%3E %3C/svg%3E");
  }

  /* Disabled */
  [type='checkbox']:disabled {
    background-color: #ccd3d8;
    opacity: 0.84;
    cursor: not-allowed;
  }
</style>
