<script lang="ts">
  import { adapterInfo } from '../../stores/main';
</script>

{#each Object.entries($adapterInfo) as entry}
  <p>{entry[0]}: <span>{entry[1]}</span></p>
{/each}

<style>
  p,
  span {
    font-size: 15px;
  }

  p {
    color: #777777;
  }

  p:not(:last-of-type) {
    margin: 0 0 5px 0;
    border-bottom: 1px solid #272727;
    padding: 0 0 1px 0;
  }

  p span {
    color: #ddd;
  }
</style>
