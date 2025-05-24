import { adapterInfo, centralErrorStatusMessage } from '../../routes/stores/main';

export async function getDeviceAndContext(canvas: HTMLCanvasElement) {
  let errorMessage = 'Your browser does not support WebGPU or one of the required features.';

  try {
    const adapter = await navigator.gpu?.requestAdapter();

    if (!adapter) {
      errorMessage = 'WebGPU not available: No adapter found.';
      throw new Error(errorMessage);
    }

    adapterInfo.set({
      'Max Texture Dimension 1D': adapter.limits.maxTextureDimension1D,
      'Max Texture Dimension 2D': adapter.limits.maxTextureDimension2D,
      'Max Texture Dimension 3D': adapter.limits.maxTextureDimension3D,
      'Max Texture Array Layers': adapter.limits.maxTextureArrayLayers,
      'Max Bind Groups': adapter.limits.maxBindGroups,
      'Max Dynamic Uniform Buffers Per Pipeline Layout':
        adapter.limits.maxDynamicUniformBuffersPerPipelineLayout,
      'Max Dynamic Storage Buffers Per Pipeline Layout':
        adapter.limits.maxDynamicStorageBuffersPerPipelineLayout,
      'Max Sampled Textures Per Shader Stage': adapter.limits.maxSampledTexturesPerShaderStage,
      'Max Samplers Per Shader Stage': adapter.limits.maxSamplersPerShaderStage,
      'Max Storage Buffers Per Shader Stage': adapter.limits.maxStorageBuffersPerShaderStage,
      'Max Storage Textures Per Shader Stage': adapter.limits.maxStorageTexturesPerShaderStage,
      'Max Uniform Buffers Per Shader Stage': adapter.limits.maxUniformBuffersPerShaderStage,
      'Max Uniform Buffer Binding Size (MB)':
        adapter.limits.maxUniformBufferBindingSize / (1024 * 1024),
      'Max Storage Buffer Binding Size (MB)':
        adapter.limits.maxStorageBufferBindingSize / (1024 * 1024),
      'Max Vertex Buffers': adapter.limits.maxVertexBuffers,
      'Max Vertex Attributes': adapter.limits.maxVertexAttributes,
      'Max Vertex Buffer Array Stride': adapter.limits.maxVertexBufferArrayStride,
      'Max Compute Workgroup Storage Size': adapter.limits.maxComputeWorkgroupStorageSize,
      'Max Compute Invocations Per Workgroup': adapter.limits.maxComputeInvocationsPerWorkgroup,
      'Max Compute Workgroup Size X': adapter.limits.maxComputeWorkgroupSizeX,
      'Max Compute Workgroup Size Y': adapter.limits.maxComputeWorkgroupSizeY,
      'Max Compute Workgroup Size Z': adapter.limits.maxComputeWorkgroupSizeZ,
      'Max Compute Workgroups Per Dimension': adapter.limits.maxComputeWorkgroupsPerDimension,
      'Max Buffer Size (MB)': adapter.limits.maxBufferSize / (1024 * 1024)
    });

    const canTimestamp = adapter.features.has('timestamp-query');

    const requiredLimits: Partial<GPUSupportedLimits> = {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: adapter.limits.maxBufferSize
    };

    const device = await (adapter as any).requestDevice({
      requiredLimits,
      requiredFeatures: [
        ...(canTimestamp ? ['timestamp-query'] : []),
        'float32-filterable'
        // 'shader-f16'
      ]
    });

    const context = canvas.getContext('webgpu');

    if (!device) {
      errorMessage =
        'Failed to get WebGPU device. The requested limits or features might not be supported, or the GPU is unavailable.';
      throw new Error(errorMessage);
    }
    if (!context) {
      errorMessage = 'Failed to get WebGPU context from canvas.';
      throw new Error(errorMessage); // Should not happen if device is fine, but good practice
    }

    console.log('Device obtained with limits:');
    console.log(
      ` - Max Storage Buffer Binding Size: ${
        device.limits.maxStorageBufferBindingSize / (1024 * 1024)
      } MB`
    );
    console.log(` - Max Buffer Size: ${device.limits.maxBufferSize / (1024 * 1024)} MB`);

    return { device, context };
  } catch (err) {
    let finalErrorMessage = errorMessage;
    if (err instanceof Error) {
      finalErrorMessage = err.message;
    } else if (typeof err === 'string') {
      finalErrorMessage = err;
    }
    console.error('WebGPU Initialization Error:', finalErrorMessage, err);
    centralErrorStatusMessage.set(finalErrorMessage);
    throw new Error(finalErrorMessage);
  }
}
