import { centralErrorStatusMessage } from '../../routes/stores/main';

export async function getDeviceAndContext(canvas: HTMLCanvasElement) {
  let errorMessage = 'Your browser does not support WebGPU or one of the required features';

  try {
    const adapter = await navigator.gpu?.requestAdapter();
    const canTimestamp = adapter?.features.has('timestamp-query');
    const device = await (adapter as any)?.requestDevice({
      requiredFeatures: [
        ...(canTimestamp ? ['timestamp-query'] : []),
        'float32-filterable'
        // 'shader-f16' // this feature is only used to test the error message
      ]
    });
    const context = canvas.getContext('webgpu');

    if (!device || !context) {
      centralErrorStatusMessage.set(errorMessage);
      throw new Error(errorMessage);
    }

    return { device, context };
  } catch {
    centralErrorStatusMessage.set(errorMessage);
    throw new Error(errorMessage);
  }
}
