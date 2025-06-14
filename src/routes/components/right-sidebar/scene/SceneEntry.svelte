<script lang="ts">
  export let name: string;
  export let thumbnailUrl: string;
</script>

<div class="container">
  <p>{name}</p>
  <img src={thumbnailUrl} />
</div>

<style>
  .container {
    margin: 0 0 25px 0;
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
