export const misPart = /* wgsl */ `
  fn getMisWeight(pdf0: f32, pdf1: f32) -> f32 {
    var misWeight = 0.0;
  
    if (config.MIS_TYPE == ONE_SAMPLE_MODEL || config.MIS_TYPE == NEXT_EVENT_ESTIMATION) {
      if (config.MIS_TYPE == ONE_SAMPLE_MODEL) {
        misWeight = pdf0 / ((pdf0 + pdf1) * 0.5);
        if (config.USE_POWER_HEURISTIC == 1) {
          let b1 = pdf0;
          let b2 = pdf1;
          misWeight = (b1 * b1) / ((b1 * b1 + b2 * b2) * 0.5);
        }
      }
    
      if (config.MIS_TYPE == NEXT_EVENT_ESTIMATION) {
        misWeight = pdf0 / (pdf0 + pdf1);
        if (config.USE_POWER_HEURISTIC == 1) {
          let b1 = pdf0;
          let b2 = pdf1;
          misWeight = (b1 * b1) / (b1 * b1 + b2 * b2);
        }
      }
    }
  
    return misWeight;
  }
`;
