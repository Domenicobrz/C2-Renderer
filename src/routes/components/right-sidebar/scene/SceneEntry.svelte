<script lang="ts">
  export let name: string;
  export let thumbnailUrl: string;
  export let selected: boolean;
</script>

<div class="container" class:selected>
  <p>{name}</p>
  <img src={thumbnailUrl} on:click />
</div>

<style>
  .container {
    margin: 0 0 25px 0;
  }

  .container.selected img {
    border: 2px solid white;
  }

  .container.selected p {
    font-weight: bold;
  }

  p {
    margin: 0 0 10px 0;
  }

  img {
    cursor: pointer;
    display: block;
    width: 100%;
    aspect-ratio: 2 / 1.25;
    object-fit: cover;
    border-radius: 8px;
  }
</style>
