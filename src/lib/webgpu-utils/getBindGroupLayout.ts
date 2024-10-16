export function getComputeBindGroupLayout(
  device: GPUDevice,
  entries: ('storage' | 'uniform' | 'read-only-storage' | 'texture' | '2d-array' | '3d')[]
) {
  return getBindGroupLayout(device, GPUShaderStage.COMPUTE, entries);
}

export function getFragmentBindGroupLayout(
  device: GPUDevice,
  entries: ('storage' | 'uniform' | 'read-only-storage' | 'texture' | '2d-array' | '3d')[]
) {
  return getBindGroupLayout(device, GPUShaderStage.FRAGMENT, entries);
}

function getBindGroupLayout(
  device: GPUDevice,
  visibility: number,
  entries: ('storage' | 'uniform' | 'read-only-storage' | 'texture' | '2d-array' | '3d')[]
) {
  return device.createBindGroupLayout({
    entries: entries.map((value, i) => {
      if (value == 'storage' || value == 'uniform' || value == 'read-only-storage') {
        return {
          binding: i,
          visibility,
          buffer: {
            type: value
          }
        };
      }

      if (value == 'texture') {
        return {
          binding: i,
          visibility,
          texture: {}
        };
      }

      if (value == '2d-array') {
        return {
          binding: i,
          visibility,
          texture: {
            viewDimension: '2d-array'
          }
        };
      }

      if (value == '3d') {
        return {
          binding: i,
          visibility,
          texture: {
            viewDimension: '3d'
          }
        };
      }

      throw new Error('Unexpected bind-group-layout value type');
    })
  });
}
