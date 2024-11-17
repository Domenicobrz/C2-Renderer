async function loadImageBitmap(url: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  return await createImageBitmap(blob, { colorSpaceConversion: 'none' });
}

export async function loadTexture(device: GPUDevice, path: string) {
  const source = await loadImageBitmap(path);
  const texture = device.createTexture({
    label: path,
    format: 'rgba8unorm',
    size: [source.width, source.height],
    usage:
      GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  });

  device.queue.copyExternalImageToTexture(
    { source, flipY: true },
    { texture },
    { width: source.width, height: source.height }
  );

  return texture;
}
