export class ComputePassPerformance {
  private querySet: GPUQuerySet;
  private resolveBuffer: GPUBuffer;
  private resultBuffer: GPUBuffer;

  private average: number[] = [];

  constructor(device: GPUDevice) {
    this.querySet = device.createQuerySet({
      type: 'timestamp',
      count: 2
    });
    this.resolveBuffer = device.createBuffer({
      label: 'resolve - pass performance',
      size: this.querySet.count * 8,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
    });
    this.resultBuffer = device.createBuffer({
      label: 'result - pass performance',
      size: this.resolveBuffer.size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
  }

  updateComputePassDescriptor(cpd: GPUComputePassDescriptor) {
    cpd.timestampWrites = {
      querySet: this.querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1
    };
  }

  resolve(encoder: GPUCommandEncoder) {
    encoder.resolveQuerySet(this.querySet, 0, this.querySet.count, this.resolveBuffer, 0);
    if (this.resultBuffer.mapState === 'unmapped') {
      encoder.copyBufferToBuffer(
        this.resolveBuffer,
        0,
        this.resultBuffer,
        0,
        this.resultBuffer.size
      );
    }
  }

  getDeltaInMilliseconds(): Promise<number> {
    return new Promise((res, rej) => {
      if (this.resultBuffer.mapState === 'unmapped') {
        this.resultBuffer.mapAsync(GPUMapMode.READ).then(() => {
          const times = new BigInt64Array(this.resultBuffer.getMappedRange());
          res(Number(times[1] - times[0]) / 1000000);
          this.resultBuffer.unmap();
        });
      } else {
        rej();
      }
    });
  }

  reset() {
    this.average = [];
  }

  getAverageDeltaInMilliseconds(): Promise<number> {
    return new Promise((res, rej) => {
      if (this.resultBuffer.mapState === 'unmapped') {
        this.resultBuffer.mapAsync(GPUMapMode.READ).then(() => {
          const times = new BigInt64Array(this.resultBuffer.getMappedRange());

          this.average.push(Number(times[1] - times[0]) / 1000000);
          if (this.average.length > 30) this.average.splice(0, 1);

          res(this.average.reduce((prev, curr) => prev + curr / this.average.length));

          this.resultBuffer.unmap();
        });
      } else {
        rej();
      }
    });
  }
}
