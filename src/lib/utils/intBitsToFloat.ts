export function intBitsToFloat(value: number) {
  let ab = new ArrayBuffer(4);

  let uv = new Int32Array(ab, 0, 1);
  uv[0] = value;

  let fv = new Float32Array(ab, 0, 1);
  return fv[0];
}

export function uintBitsToFloat(value: number) {
  let ab = new ArrayBuffer(4);

  let uv = new Uint32Array(ab, 0, 1);
  uv[0] = value;

  let fv = new Float32Array(ab, 0, 1);
  return fv[0];
}
