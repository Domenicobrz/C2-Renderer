export function getBindGroupLayout(
  device: GPUDevice,
  entries: { visibility: number; type: GPUBufferBindingType | undefined }[]
) {
  return device.createBindGroupLayout({
    entries: entries.map(({ visibility, type }, i) => {
      return {
        binding: i,
        visibility,
        buffer: {
          type
        }
      };
    })
  });
}
