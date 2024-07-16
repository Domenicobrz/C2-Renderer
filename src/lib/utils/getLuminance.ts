import { Vector3 } from 'three';

export function getLuminance(emission: Vector3) {
  // https://stackoverflow.com/a/56678483/7379920
  // step 3 from the question, we care about real luminance and not perceived luminance
  // the rgb values provided are already linearized
  return 0.2126 * emission.x + 0.7152 * emission.y + 0.0722 * emission.z;
}
