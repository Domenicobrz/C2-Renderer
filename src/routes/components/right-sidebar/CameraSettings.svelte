<script lang="ts">
  import { Vector2 } from 'three';
  import type { Vector3 } from 'three';
  import { cameraInfoStore, cameraMovementInfoStore } from '../../stores/main';
  import IronSightIcon from '../icons/IronSightIcon.svelte';
  import Spacer from '../Spacer.svelte';
  import type { RendererInterface } from '$lib/C2';
  import RangeSlider from 'svelte-range-slider-pips';
  import Folder from '../Folder.svelte';
  import Separator from '../Separator.svelte';
  import Toggle from '../Toggle.svelte';

  export let canvasRef: HTMLCanvasElement;
  export let renderer: RendererInterface;

  $: {
    if (canvasRef) {
      canvasRef.addEventListener('click', onCanvasClick);
    }
  }

  let clickSetFocusDistance = false;

  function onFDBtnClick() {
    clickSetFocusDistance = true;
  }

  function onCanvasClick(e: MouseEvent) {
    if (clickSetFocusDistance) {
      let x = e.offsetX;
      let y = canvasRef.clientHeight - e.offsetY;
      let t = renderer.getFocusDistanceFromScreenPoint(new Vector2(x, y));
      if (t > -1) {
        $cameraInfoStore.focusDistance = t;
      }
      clickSetFocusDistance = false;
    }
  }

  let tiltShiftX = '0';
  let tiltShiftY = '0';
  let fovSliderValue = [0];
  let fovRangeStep = 0.01;
  cameraInfoStore.subscribe((newState) => {
    if (fovSliderValue[0] !== newState.fov) {
      fovSliderValue = [newState.fov - (newState.fov % fovRangeStep)];
    }
    if (parseFloat(tiltShiftX) !== newState.tiltShift.x) {
      tiltShiftX = newState.tiltShift.x.toString();
    }
    if (parseFloat(tiltShiftY) !== newState.tiltShift.y) {
      tiltShiftY = newState.tiltShift.y.toString();
    }
  });
  function onFovSliderChange(e: any) {
    $cameraInfoStore.fov = parseFloat(e.detail.value);
  }

  function onTiltShiftXChange(e: any) {
    let value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      $cameraInfoStore.tiltShift = new Vector2(value, parseFloat(tiltShiftY));
    }
  }
  function onTiltShiftYChange(e: any) {
    let value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      $cameraInfoStore.tiltShift = new Vector2(parseFloat(tiltShiftX), value);
    }
  }
  function vec3ToString(vec: Vector3) {
    return `(${vec.x.toFixed(1)}, ${vec.y.toFixed(1)}, ${vec.z.toFixed(1)})`;
  }
</script>

<span
  >Exposure: <input
    class="samples-limit-input"
    type="text"
    bind:value={$cameraInfoStore.exposure}
  /></span
>
<Spacer vertical={5} />
<div class="flex-row">
  <span>Fov: </span>
  <RangeSlider
    min={0.001}
    max={Math.PI * 0.5}
    bind:values={fovSliderValue}
    on:change={onFovSliderChange}
    float
    step={fovRangeStep}
    springValues={{ stiffness: 1, damping: 1 }}
  />
</div>
<Spacer vertical={5} />
<span
  >Aperture: <input
    class="samples-limit-input"
    type="text"
    bind:value={$cameraInfoStore.aperture}
  /></span
>
<Spacer vertical={5} />
<div class="fd-flex-row">
  <span>Focus distance:</span>
  <Spacer horizontal={5} />
  <input class="samples-limit-input" type="text" bind:value={$cameraInfoStore.focusDistance} />
  <Spacer horizontal={5} />
  <button class="click-set-fd" class:active={clickSetFocusDistance} on:click={onFDBtnClick}
    ><IronSightIcon /></button
  >
</div>
<Spacer vertical={15} />
<span
  >Tilt Shift (x,y): <input
    class="samples-limit-input"
    type="text"
    bind:value={tiltShiftX}
    on:keyup={onTiltShiftXChange}
  />
  <input
    class="samples-limit-input"
    type="text"
    bind:value={tiltShiftY}
    on:keyup={onTiltShiftYChange}
  />
</span>
<Spacer vertical={15} />
<Toggle label="Cat's eye bokeh:" bind:checked={$cameraInfoStore.catsEyeBokehEnabled} />
<Spacer vertical={10} />
<div class="flex-row ce-options" class:disabled={!$cameraInfoStore.catsEyeBokehEnabled}>
  <span>Cat's eye bokeh<br />(mult, pow)</span>
  <input class="samples-limit-input" type="text" bind:value={$cameraInfoStore.catsEyeBokehMult} />
  <Spacer horizontal={4} />
  <input class="samples-limit-input" type="text" bind:value={$cameraInfoStore.catsEyeBokehPow} />
</div>

<Folder name="Camera movement" roundBox expanded={false}>
  <p class="darken-span">
    Position: <span>{vec3ToString($cameraMovementInfoStore.position)}</span>
  </p>
  <Spacer vertical={3} />
  <p class="darken-span">
    Target: <span>{vec3ToString($cameraMovementInfoStore.target)}</span>
  </p>
  <Spacer vertical={10} />

  <Separator />

  <p>
    Use <span class="kbtn">w</span><span class="kbtn">a</span><span class="kbtn">s</span><span
      class="kbtn">d</span
    ><span class="kbtn">q</span><span class="kbtn">e</span>to move
  </p>
  <Spacer vertical={10} />
  <p>Click & drag to rotate</p>
  <Spacer vertical={10} />
  <p>Hold <span class="kbtn fit-to-size">shift</span>for precise movements</p>
  <Spacer vertical={15} />
  <Separator />
  <span
    >Movement speed: <input
      class="samples-limit-input"
      type="text"
      bind:value={$cameraMovementInfoStore.movementSpeed}
    /></span
  >
  <Spacer vertical={5} />
  <span
    >Rotation speed: <input
      class="samples-limit-input"
      type="text"
      bind:value={$cameraMovementInfoStore.rotationSpeed}
    /></span
  >
</Folder>

<style>
  .samples-limit-input {
    width: 50px;
  }

  .kbtn {
    font-size: 12px;
    font-family: monospace;
    display: inline-block;
    width: 20px;
    height: 20px;
    padding: 3px;
    border: 1px solid #666;
    border-radius: 3px;
    text-align: center;
    line-height: calc(20px - 4px * 2);
    background: #282828;
    margin: 0 5px 0 0;
  }
  .kbtn.fit-to-size {
    padding: 3px 6px;
    width: unset;
  }

  button {
    background: #333;
    color: #ddd;
    border-radius: 4px;
    padding: 5px 10px;
    border: 1px solid #636363;
  }

  button:active {
    background: #454545;
  }

  button.click-set-fd {
    width: 25px;
    height: 25px;
    padding: 0;
  }
  button:active {
    background: #333;
  }
  :global(button.click-set-fd > svg) {
    fill: #666;
  }
  :global(button.active.click-set-fd > svg) {
    fill: #bbb;
  }

  input[type='text'] {
    background: #454545;
    color: #ddd;
    border-radius: 4px;
    padding: 3px 7px;
    border: 1px solid #636363;
    font-size: 12px;
  }

  p,
  span {
    font-size: 15px;
  }

  .fd-flex-row {
    display: flex;
    flex-flow: row nowrap;
    align-items: center;
    margin: 0 0 -5px 0;
  }

  .flex-row {
    display: flex;
    flex-flow: row nowrap;
    align-items: center;
    margin: 0 0 0px 0;
  }

  .flex-row span {
    margin: 0 9px 0 0;
  }

  .ce-options.disabled {
    opacity: 0.35;
    pointer-events: none;
  }

  p.darken-span span {
    color: #aaa;
  }
</style>
