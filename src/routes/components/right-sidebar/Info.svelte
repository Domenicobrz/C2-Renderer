<script lang="ts">
  import { bvhInfo, samplesInfo } from '../../stores/main';
</script>

<p>Bvh nodes count: <span>{$bvhInfo.nodesCount}</span></p>
<p>Sample: <span>{$samplesInfo.count}</span></p>
<p>Tile: <span>{$samplesInfo.tileSize}</span></p>
<p>
  Performance: <span
    >{$samplesInfo.count == $samplesInfo.limit ? 0 : $samplesInfo.ms.toFixed(0)} ms</span
  >
</p>
<p>Click target: <span class="user-selectable">{$samplesInfo.clickTarget}</span></p>

<style>
  p,
  span {
    font-size: 15px;
  }

  p span {
    color: #aaa;
  }

  .user-selectable {
    user-select: text;
  }
</style>
