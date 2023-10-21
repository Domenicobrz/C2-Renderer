export async function Renderer(canvas: HTMLCanvasElement): Promise<void> {

  // WebGPU typescript types are loaded from an external library:
  // https://github.com/gpuweb/types
  // apparently the standard installation didn't include WebGPU types
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  const context = canvas.getContext('webgpu');

  if (!device || !context) {
    throw new Error('need a browser that supports WebGPU');
  }

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
  });




  const input = new Float32Array(8 * 8 * 4);
  const workBuffer = device.createBuffer({
    label: 'work buffer',
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(workBuffer, 0, input);

  const resultBuffer = device.createBuffer({
    label: 'result buffer',
    size: input.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  });





  // *************** compute pipeline ****************
  const computeModule = device.createShaderModule({
    label: 'compute module',
    code: /*wgsl*/`
      @group(0) @binding(0) var<storage, read_write> data: array<vec3f>;
 
      @compute @workgroup_size(8, 8) fn computeSomething(
        @builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>,
      ) {
        let idx = lid.y * 8 + lid.x;
        data[idx] = vec3f(
          sin(f32(lid.x) * 1.75) * 0.5 + 0.5, 
          cos(f32(lid.y) * 1.75) * 0.5 + 0.5, 
          0
        );
      }
    `,
  });

  const computePipeline = device.createComputePipeline({
    label: 'compute pipeline',
    layout: 'auto',
    compute: {
      module: computeModule,
      entryPoint: 'computeSomething',
    },
  });

  const computeBindGroup = device.createBindGroup({
    label: 'compute bindgroup',
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: workBuffer } },
    ],
  });


  // *************** render pipeline ****************
  const renderModule = device.createShaderModule({
    label: 'render shader',
    code: /* wgsl */`
      struct VSOutput {
        @builtin(position) position: vec4f,
        @location(0) texcoord: vec2f,
      };

      @group(0) @binding(0) var<storage> data: array<vec3f>;

      @vertex fn vs(
        @builtin(vertex_index) vertexIndex : u32
      ) -> VSOutput {
        let pos = array(
          vec2f( 0.0,  0.0),  // center
          vec2f( 1.0,  0.0),  // right, center
          vec2f( 0.0,  1.0),  // center, top

          // 2st triangle
          vec2f( 0.0,  1.0),  // center, top
          vec2f( 1.0,  0.0),  // right, center
          vec2f( 1.0,  1.0),  // right, top
        );

        var vsOutput: VSOutput;
        let xy = pos[vertexIndex];

        vsOutput.position = vec4f(xy * 2 - 1, 0.0, 1.0);
        vsOutput.texcoord = xy;
        
        return vsOutput;
      }

      @fragment fn fs(fsInput: VSOutput) -> @location(0) vec4f {
        let x = floor(fsInput.texcoord.x * 8);
        let y = floor(fsInput.texcoord.y * 8);
        let idx = i32(y * 8 + x);
        
        return vec4f(data[idx], 1);
      }
    `,
  });

  const renderBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "read-only-storage"
        },
      },
    ],
  });

  const renderPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [renderBindGroupLayout]
  });

  const renderPipeline = device.createRenderPipeline({
    label: 'render pipeline',
    layout: renderPipelineLayout,
    vertex: {
      module: renderModule,
      entryPoint: 'vs',
    },
    fragment: {
      module: renderModule,
      entryPoint: 'fs',
      targets: [{ format: presentationFormat }],
    },
  });

  const renderBindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: workBuffer, size: input.byteLength, } },
    ],
  });

  // Get the current texture from the canvas context and
  // set it as the texture to render to.
  const renderPassDescriptor = {
    label: 'our basic canvas renderPass',
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };





  // Encode commands to do the computation
  const encoder = device.createCommandEncoder({
    label: 'doubling encoder',
  });
  const pass = encoder.beginComputePass({
    label: 'doubling compute pass',
  });
  pass.setPipeline(computePipeline);
  pass.setBindGroup(0, computeBindGroup);
  pass.dispatchWorkgroups(1);
  pass.end();

  // Encode a command to copy the results to a mappable buffer.
  encoder.copyBufferToBuffer(workBuffer, 0, resultBuffer, 0, resultBuffer.size);

  // Finish encoding and submit the commands
  const computeCommandBuffer = encoder.finish();
  device.queue.submit([computeCommandBuffer]);



  // ******************** render to canvas ********************

  const renderEncoder = device.createCommandEncoder({ label: 'render encoder' });
  const renderPass = renderEncoder.beginRenderPass(renderPassDescriptor);
  renderPass.setPipeline(renderPipeline);
  renderPass.setBindGroup(0, renderBindGroup);
  renderPass.draw(6);  // call our vertex shader 6 times
  renderPass.end();

  const renderCommandBuffer = renderEncoder.finish();
  device.queue.submit([renderCommandBuffer]);
}

export function loadModel(path: string): void {

}