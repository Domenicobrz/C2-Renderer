export const misPart = /* wgsl */ `
  fn getMisWeight(pdf0: f32, pdf1: f32) -> f32 {
    var misWeight = pdf0 / (pdf0 + pdf1);
    
    if (config.USE_POWER_HEURISTIC == 1) {
      let b1 = pdf0;
      let b2 = pdf1;
      misWeight = (b1 * b1) / (b1 * b1 + b2 * b2);
    }
  
    return misWeight;
  }
`;
