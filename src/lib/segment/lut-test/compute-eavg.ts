import { ESS2, ESSI2 } from './luts';

function integrateI(x: number, z: number) {
  let step = 1 / 16;
  let int = 0;

  for (let y = 0; y < 16; y++) {
    let dotVN = (y + 0.5) / 16;

    let idx = z * 16 * 16 + y * 16 + x;

    let v = ESSI2[idx];
    int += v * /* Math.abs(dotVN) */ dotVN * step;
  }
  int *= 2;

  return int;
}

function integrate(x: number, z: number) {
  let step = 1 / 16;
  let int = 0;

  for (let y = 0; y < 16; y++) {
    let dotVN = (y + 0.5) / 16;

    let idx = z * 16 * 16 + y * 16 + x;

    let v = ESS2[idx];
    int += v * /* Math.abs(dotVN) */ dotVN * step;
  }
  int *= 2;

  return int;
}

export function calculateEavg2() {
  // x: roughness, y: eta
  let Eavg = [];

  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 16; j++) {
      Eavg.push(integrate(j, i));
    }
  }

  console.log(Eavg);
}

export function calculateEavgI2() {
  // x: roughness, y: eta
  let EavgI = [];

  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 16; j++) {
      EavgI.push(integrateI(j, i));
    }
  }

  console.log(EavgI);
}
