import { globals } from '$lib/C2';
import { previewSegmentShader } from '$lib/shaders/previewSegmentShader';

export class PreviewSegment {
  // private fields
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private pipeline: GPURenderPipeline;
  private renderPassDescriptor: GPURenderPassDescriptor;

  constructor(context: GPUCanvasContext, presentationFormat: GPUTextureFormat) {
    this.context = context;
    let device = globals.device;
    this.device = device;

    // *************** render pipeline ****************
    const module = device.createShaderModule({
      label: 'preview segment shader',
      code: previewSegmentShader
    });

    this.pipeline = device.createRenderPipeline({
      label: 'preview segment pipeline',
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs'
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: presentationFormat }]
      }
    });

    this.renderPassDescriptor = {
      label: 'our basic canvas renderPass',
      colorAttachments: [
        {
          // view: <- to be filled out when we render
          clearValue: [0.3, 0.3, 0.3, 1],
          loadOp: 'clear',
          storeOp: 'store',
          view: context.getCurrentTexture().createView()
        }
      ]
    };
  }

  render() {
    // make a command encoder to start encoding commands
    const encoder = this.device.createCommandEncoder({ label: 'preview segment encoder' });

    // make a render pass encoder to encode render specific commands
    const pass = encoder.beginRenderPass(this.renderPassDescriptor);
    pass.setPipeline(this.pipeline);
    pass.draw(3); // call our vertex shader 3 times.
    pass.end();

    const commandBuffer = encoder.finish();
    this.device.queue.submit([commandBuffer]);
  }
}
