import { ESS2, ESS3, ESSI2 } from './luts';

function integrateI(x: number, z: number) {
  let step = 1 / 32;
  let int = 0;

  for (let y = 0; y < 32; y++) {
    let dotVN = (y + 0.5) / 32;

    let idx = z * 32 * 32 + y * 32 + x;

    // let v = ESSI2[idx];
    int += v * /* Math.abs(dotVN) */ dotVN * step;
  }
  int *= 2;

  return int;
}

function integrate(x: number, z: number) {
  let step = 1 / 32;
  let int = 0;

  for (let y = 0; y < 32; y++) {
    let dotVN = (y + 0.5) / 32;

    let idx = z * 32 * 32 + y * 32 + x;

    let v = ESS3[idx];
    int += v * /* Math.abs(dotVN) */ dotVN * step;
  }
  int *= 2;

  return int;
}

export function calculateEavg3() {
  // x: roughness, y: eta
  let Eavg = [];

  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < 32; j++) {
      Eavg.push(integrate(j, i));
    }
  }

  console.log(Eavg);
}

export function calculateEavgI3() {
  // x: roughness, y: eta
  let EavgI = [];

  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < 32; j++) {
      EavgI.push(integrateI(j, i));
    }
  }

  console.log(EavgI);
}
