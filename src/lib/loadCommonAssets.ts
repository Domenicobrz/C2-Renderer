import { globals } from './C2';
import { LUTManager, LUTtype } from './managers/lutManager';
import { loadTexture } from './webgpu-utils/getTexture';

// TODO: Promise.all() would be better here
export async function loadCommonAssets() {
  let lutManager = new LUTManager(globals.device);

  await lutManager.load(
    'luts/torranceSparrowMultiScatter.LUT',
    LUTtype.MultiScatterTorranceSparrow
  );
  await lutManager.load('luts/multiScatterDielectricEo.LUT', LUTtype.MultiScatterDielectricEo);
  await lutManager.load(
    'luts/multiScatterDielectricEoInverse.LUT',
    LUTtype.MultiScatterDielectricEoInverse
  );

  let blueNoiseTexture = await loadTexture(
    globals.device,
    'blue-noise-textures/256_256/HDR_RGBA_0.png'
  );

  globals.common.lutManager = lutManager;
  globals.common.blueNoiseTexture = blueNoiseTexture;
}
