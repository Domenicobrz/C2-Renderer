function samplePdf1() {
  return Math.random();
}

function pdf1(sample) {
  return 1;
}

function samplePdf2() {
  // if (Math.random() < 0.9) return 0.9 + Math.random() * 0.1;
  // return Math.random() * 0.1;

  return 0.9 + Math.random() * 0.1;
}

function pdf2(sample) {
  if (sample < 0.9) return 0;
  else return 10;
}

// the integral of F is 15.2
function sampleF(x) {
  if (x < 0.9) return 8;
  return 80;
}

const N = 10000;
let sum = 0;
for (let i = 0; i < N; i++) {
  // what's interesting is that "only pdf1" returns a good estimate,
  // as well as normal and one-sample mis,
  // but "only pdf2" returns a bad estimate.
  // which proves that the current light sampling method CAN be used as long as
  // mis is used
  let type = 'one-sample model mis';

  if (type == 'only pdf1') {
    let sX = samplePdf1();
    let pX = pdf1(sX);
    let fX = sampleF(sX);
    sum += fX / pX;
  } else if (type == 'only pdf2') {
    let sX2 = samplePdf2();
    let pX2 = pdf2(sX2);
    let fX2 = sampleF(sX2);
    sum += fX2 / pX2;
  } else if (type == 'normal mis') {
    // now let's do MIS, this is the normal model
    let sX = samplePdf1();
    let pX = pdf1(sX);
    let fX = sampleF(sX);
    let wX = pdf1(sX) / (pdf1(sX) + pdf2(sX));

    let sX2 = samplePdf2();
    let pX2 = pdf2(sX2);
    let fX2 = sampleF(sX2);
    let wX2 = pdf2(sX2) / (pdf1(sX2) + pdf2(sX2));

    sum += wX * (fX / pX) + wX2 * (fX2 / pX2);
  } else if (type == 'one-sample model mis') {
    if (Math.random() < 0.5) {
      // now let's do MIS, but with the one-sample model
      let sX = samplePdf1();
      let fX = sampleF(sX);
      let sumPdfs = pdf1(sX) + pdf2(sX);

      // it works both ways, wether I simplify or not
      // sum += wX * (fX / pX) * 2;
      sum += (fX / sumPdfs) * 2;
    } else {
      let sX2 = samplePdf2();
      let fX2 = sampleF(sX2);
      let sumPdfs = pdf1(sX2) + pdf2(sX2);

      // it works both ways, wether I simplify or not
      // sum += wX2 * (fX2 / pX2) * 2;
      sum += (fX2 / sumPdfs) * 2;
    }
  }
}

sum /= N;
console.log(sum);
