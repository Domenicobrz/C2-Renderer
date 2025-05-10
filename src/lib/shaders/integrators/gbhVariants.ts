export let GBHStandard = /* wgsl */ `
fn generalizedBalanceHeuristic(
  X: PathInfo, Y: PathInfo, Xconfidence: f32, idx: i32, candidates: array<Reservoir, MAX_SR_CANDIDATES_COUNT>
) -> f32 {
  let J = (Y.jacobian.x / X.jacobian.x) * abs(Y.jacobian.y / X.jacobian.y);
  // in this case I'm dividing by the jacobian because it was computed when going from x->y,
  // and here we want to basically "transform back" y->x, and doing that would result in the inverse
  // of the jacobian that we got from x->y
  var c = Xconfidence;
  var numerator = c * length(X.F) / J;
  var denominator = c * length(X.F) / J;

  var M = config.RESTIR_SR_CANDIDATES;
  if (temporalResample) {
    M = config.RESTIR_TEMP_CANDIDATES;
  }

  for (var i = 0; i < M; i++) {
    if (i == idx) { continue; }

    let XjCandidate = candidates[i];

    // there's a big difference between a null candidate path, and a null candidate
    // if one of the ""candidates"" is outside of the screen boundaries, we're not simply
    // stating that the reservoir is null. It's just totally unuseable, there can't be any path
    // associated with a pixel outside the screen boundaries. Nothing at all, none.
    // However, some nearby pixels might have been unable to find a candidate path Y, but *must* still
    // be tested in the generalized balance heuristic. They may have failed to generate a candidate
    // path, but they may be able to successfully random replay the path we're testing here with Y
    // Thus they must be considered and used here otherwise we'll gain energy where we shouldn't.
    // This is the reason why we're only checking if the candidate has a negative seed, that means
    // that the ""candidate"" is one of those samples that fell outside the screen boundaries and is thus
    // unuseable. This would have been easier if we had access to a dynamic array but sadly we can't
    // same applies for candidates that have been removed because of Gbuffer differences

    // if (Xj.isNull > 0) { continue; }
    if (XjCandidate.domain.x < 0) { continue; }

    if (inspectRR) {
      debugLog(888.0);
    }

    // shift Y into Xj's pixel
    let randomReplayResult = randomReplay(Y, XjCandidate.Y.firstVertexSeed, vec2u(XjCandidate.domain));
    if (randomReplayResult.valid > 0) {
      // shift Y -> Xj and evaluate jacobian
      var Xj = Y;
      Xj.F = randomReplayResult.pHat;
      Xj.jacobian = randomReplayResult.jacobian;

      // since we're doing y->xj,  the xj terms appear on top of the fraction
      let J = (Xj.jacobian.x / Y.jacobian.x) * abs(Xj.jacobian.y / Y.jacobian.y);
      let XjConfidence = XjCandidate.c;
      let res = XjConfidence * length(Xj.F) * J;

      if (inspectRR) {
        debugLog(res);
      }

      denominator += res;
    }
  }

  //  TODO: what to do in this case? it did happen
  if (numerator == 0 || denominator == 0) { return 0; }

  return numerator / denominator;
}




var<private> inspectRR = false;

fn Resample(
  candidates: array<Reservoir, MAX_SR_CANDIDATES_COUNT>, 
  domain: vec2u
) -> Reservoir {
  // ******* important: first candidate is the current pixel's reservoir ***********
  // ******* I should probably update this function to reflect that ***********

  var r = Reservoir(
    // it's important that we set the domain here, read
    // the note inside generalizedBalanceHeuristic to understand why.
    // In this case, it's important because for next spatial iterations
    // when we return the reservoir, we have to set it as a valid pixel, by
    // assigning something other that -1,-1 to the domain value
    PathInfo(vec3f(0.0), 0, 0, 0, 0, 0, -1, vec2f(0), vec3f(0), vec3f(0), vec2f(0), vec2i(-1)),
    vec2i(domain), candidates[0].Gbuffer, 0.0, 0.0, 0.0, 1.0, vec3f(0.0),
  );

  var M : i32 = config.RESTIR_SR_CANDIDATES;
  if (temporalResample) {
    M = config.RESTIR_TEMP_CANDIDATES;
  }

  let canonicalFirstVertexSeed = candidates[0].Y.firstVertexSeed;

  var miSum = 0.0;
  debugLog(111.0);

  for (var i: i32 = 0; i < M; i++) {
    // debugLog(f32(candidates[i].domain.x));
    // debugLog(f32(candidates[i].domain.y));
    /*
      since the very first candidate is this pixel's reservoir,
      I can probably avoid the random replay
      and optimize that part away
    */
    let Xi = candidates[i];
    if (Xi.isNull > 0) {
      // we weren't able to generate a path for this candidate, thus skip it

      // we still need to update the confidence though
      r.c += Xi.c;
      continue;
    }

    // debugLog(3333.0);
    // debugLog(f32(Xi.Y.bounceCount));
    // debugLog(f32(Xi.Y.reconnectionBounce));
    // debugLog(select(0.0, 1.0, pathEndsInEnvmap(Xi.Y)));
    // debugLog(select(0.0, 1.0, pathIsLightSampled(Xi.Y)));
    // debugLog(select(0.0, 1.0, pathIsBrdfSampled(Xi.Y)));
    // debugLog(select(0.0, 1.0, pathReconnects(Xi.Y)));

    // if (i == 1) {
    //   inspectRR = true;
    // }
    let randomReplayResult = randomReplay(Xi.Y, canonicalFirstVertexSeed, domain);
    // if (i == 1) {
    //   inspectRR = false;
    // }


    // remember that the random-replay will end up creating a new path-info
    // that computed internally a different jacobian compared to the jacobian
    // that is saved in the original path Xi.Y. This is the real difference between
    // Y and X when it's presented in section 5 of the ReSTIR guide
    let X = Xi.Y;
    var Y = Xi.Y;
    Y.F = randomReplayResult.pHat;
    Y.jacobian = randomReplayResult.jacobian;

    let confidence = Xi.c;

    let jacobian = (Y.jacobian.x / X.jacobian.x) * abs(Y.jacobian.y / X.jacobian.y);
    let Wxi = Xi.Wy * jacobian;
    var wi = 0.0;

    // debugLog(55555.0);
    // debugLog(f32(randomReplayResult.valid));

    if (randomReplayResult.valid > 0) {
      if (i == 0) {
        inspectRR = true;
      }
      var mi = generalizedBalanceHeuristic(X, Y, confidence, i, candidates);
      wi = mi * length(Y.F) * Wxi;
      if (i == 0) {
        inspectRR = false;
      }
    
      // debugLog(444.0);
      // debugLog(wi);
      // debugLog(mi);
      // debugLog(length(Y.F));
      // debugLog(Wxi);
      // debugLog(444.0);
      // miSum += mi;
    }

    if (wi > 0.0) {
      let updated = updateReservoirWithConfidence(&r, Y, wi, confidence);
    } else {
      // we still need to update the confidence even after we fail
      r.c += Xi.c;
    }
  }

  // debugLog(555.0);
  // debugLog(miSum);
  debugLog(999.0);
  debugLog(999.0);
  debugLog(999.0);
  debugLog(999.0);
  debugLog(999.0);

  if (r.isNull <= 0.0) {
    r.Wy = 1 / length(r.Y.F) * r.wSum;
    // we want to make sure that new samples don't alter
    // the first vertex seed, explanation in firstVertexSeed.md
    r.Y.firstVertexSeed = canonicalFirstVertexSeed;
  }

  r.c = clamp(r.c, 1.0, config.MAX_CONFIDENCE);

  return r;
}
`;

export let GBHPairWise = /* wgsl */ `
fn generalizedBalanceHeuristicPairwiseMIS_Canonical(
  X: PathInfo, 
  Y: PathInfo, 
  Xconfidence: f32, 
  idx: i32, 
  candidates: array<Reservoir, MAX_SR_CANDIDATES_COUNT>,
  randomReplaysFromCanonicalToCandidate: array<RandomReplayResult, MAX_SR_CANDIDATES_COUNT>
) -> f32 {
  var M = config.RESTIR_SR_CANDIDATES;
  if (temporalResample) {
    M = config.RESTIR_TEMP_CANDIDATES;
  }

  var cTot = 0.0;
  for (var i = 0; i < M; i++) {
    let XjCandidate = candidates[i];
    if (XjCandidate.domain.x < 0) { continue; }
    cTot += XjCandidate.c;
  }
  let cC = candidates[0].c;
  var mC = cC / cTot;

  let canonicalFirstVertexSeed = candidates[0].Y.firstVertexSeed;
  
  // I realized that the two lines below are equivalent, even when using 3+ spatial-resampling taps
  // let pHatC = randomReplay(Y, canonicalFirstVertexSeed, vec3u(candidates[0].domain)).pHat; // <- from ReSTIR Guide
  let pHatC = X.F;

  var numerator = cC * length(pHatC);

  for (var i = 0; i < M; i++) {
    if (i == 0) { continue; } // skip canonical

    let XjCandidate = candidates[i];

    if (XjCandidate.domain.x < 0) { continue; }

    var denominator = numerator;

    // shift Y into Xj's pixel
    // let randomReplayResult = randomReplay(Y, XjCandidate.Y.firstVertexSeed, vec3u(XjCandidate.domain));
    let randomReplayResult = randomReplaysFromCanonicalToCandidate[i];
    if (randomReplayResult.valid > 0) {
      // shift Y -> Xj and evaluate jacobian
      var Xj = Y; // copy path info
      Xj.F = randomReplayResult.pHat;
      Xj.jacobian = randomReplayResult.jacobian;

      // since we're doing y->xj,  the xj terms appear on top of the fraction
      let J = (Xj.jacobian.x / Y.jacobian.x) * abs(Xj.jacobian.y / Y.jacobian.y);

      denominator += (cTot - cC) * length(Xj.F) * J;
    }
    
    mC += (XjCandidate.c / cTot) * (numerator / denominator);
  }

  return mC;
}

fn generalizedBalanceHeuristicPairwiseMIS_NonCanonical(
  X: PathInfo, Y: PathInfo, Xconfidence: f32, idx: i32, candidates: array<Reservoir, MAX_SR_CANDIDATES_COUNT>
) -> f32 {
  var M = config.RESTIR_SR_CANDIDATES;
  if (temporalResample) {
    M = config.RESTIR_TEMP_CANDIDATES;
  }

  var cTot = 0.0;
  for (var i = 0; i < M; i++) {
    let XjCandidate = candidates[i];
    if (XjCandidate.domain.x < 0) { continue; }
    cTot += XjCandidate.c;
  }
  
  let cC = candidates[0].c;
  let J = (Y.jacobian.x / X.jacobian.x) * abs(Y.jacobian.y / X.jacobian.y);
  var numerator = (cTot - cC) * length(X.F) / J;

  let canonicalFirstVertexSeed = candidates[0].Y.firstVertexSeed;
  
  // I realized that the two lines below are equivalent, even when using 3+ spatial-resampling taps
  // let pHatC = randomReplay(Y, canonicalFirstVertexSeed, vec3u(candidates[0].domain)).pHat; <- from ReSTIR Guide
  let pHatC = Y.F;
  
  var denominator = numerator + cC * length(pHatC);

  return (Xconfidence / cTot) * (numerator / denominator); 
}

fn Resample(
  candidates: array<Reservoir, MAX_SR_CANDIDATES_COUNT>, 
  domain: vec2u
) -> Reservoir {
  // ******* important: first candidate is the current pixel's reservoir ***********
  // ******* I should probably update this function to reflect that ***********

  var r = Reservoir(
    // it's important that we set the domain here, read
    // the note inside generalizedBalanceHeuristic to understand why.
    // In this case, it's important because for next spatial iterations
    // when we return the reservoir, we have to set it as a valid pixel, by
    // assigning something other that -1,-1 to the domain value
    PathInfo(vec3f(0.0), 0, 0, 0, 0, 0, -1, vec2f(0), vec3f(0), vec3f(0), vec2f(0), vec2i(-1)),
    vec2i(domain), candidates[0].Gbuffer, 0.0, 0.0, 0.0, 1.0, vec3f(0.0),
  );

  var M : i32 = config.RESTIR_SR_CANDIDATES;
  if (temporalResample) {
    M = config.RESTIR_TEMP_CANDIDATES;
  }

  let canonicalFirstVertexSeed = candidates[0].Y.firstVertexSeed;

  // This is a horribly convoluted way of creating the random replays,
  // I know, it hurts my eyes too. But it's the only way I've found to reduce
  // compilation time by 65% --- the problem seems to be having the "randomReplay"
  // function mentioned more than once inside the shader. If I do, on my GPU it ends up
  // inlining the content of the function multiple times and thus exploding 
  // in complexity and compilation times.
  // Instead, here we're calculating in advance all the random replays that will be used
  // by the PairWise GBH, and then we'll reference these results as needed later in the function
  var randomReplaysFromCandidateToCanonical = array<RandomReplayResult, MAX_SR_CANDIDATES_COUNT>();
  var randomReplaysFromCanonicalToCandidate = array<RandomReplayResult, MAX_SR_CANDIDATES_COUNT>();
  for (var i: i32 = 0; i < M * 2; i++) {
    var skip = false;
    var path = PathInfo();
    var firstVertexSeed: u32 = 0;
    var targetDomain = vec2u(0);
    var randomReplayResult = RandomReplayResult(0, vec3f(0), true, vec2f(0.0));

    if (i < M) {
      let Xi = candidates[i];

      // no need to random replay the canonical path into the canonical pixel,
      // we can just copy the values and pretend we made a RR.
      // for debugging purposes, it can be useful to comment out this if-block
      if (i == 0) {
        skip = true;
        randomReplayResult.valid = 1;
        randomReplayResult.pHat = Xi.Y.F;
        randomReplayResult.jacobian = Xi.Y.jacobian;
      }

      if (Xi.isNull > 0) {
        skip = true;
      }

      path = Xi.Y;
      firstVertexSeed = canonicalFirstVertexSeed;
      targetDomain = domain;
    }
    
    if (i >= M) {
      let j = i-M;
      if (j == 0) { skip = true; } // skip canonical
      let XjCandidate = candidates[j];
      if (XjCandidate.domain.x < 0) { skip = true; }
    
      path = candidates[0].Y;
      firstVertexSeed = XjCandidate.Y.firstVertexSeed;
      targetDomain = vec2u(XjCandidate.domain);
    }

    if (!skip) {
      randomReplayResult = randomReplay(path, firstVertexSeed, targetDomain);
    } 
    
    if (i < M) {
      randomReplaysFromCandidateToCanonical[i] = randomReplayResult;
    } else {
      randomReplaysFromCanonicalToCandidate[i-M] = randomReplayResult;
    }
  }

  for (var i: i32 = 0; i < M; i++) {
    /*
      since the very first candidate is this pixel's reservoir,
      I can probably avoid the random replay
      and optimize that part away
    */
    let Xi = candidates[i];
    if (Xi.isNull > 0) {
      // we weren't able to generate a path for this candidate, thus skip it

      // we still need to update the confidence though
      r.c += Xi.c;
      continue;
    }

    // let randomReplayResult = randomReplay(Xi.Y, canonicalFirstVertexSeed, domain);
    let randomReplayResult = randomReplaysFromCandidateToCanonical[i];
    // remember that the random-replay will end up creating a new path-info
    // that computed internally a different jacobian compared to the jacobian
    // that is saved in the original path Xi.Y. This is the real difference between
    // Y and X when it's presented in section 5 of the ReSTIR guide
    let X = Xi.Y;
    var Y = Xi.Y;
    Y.F = randomReplayResult.pHat;
    Y.jacobian = randomReplayResult.jacobian;

    let confidence = Xi.c;

    let jacobian = (Y.jacobian.x / X.jacobian.x) * abs(Y.jacobian.y / X.jacobian.y);
    let Wxi = Xi.Wy * jacobian;
    var wi = 0.0;

    if (randomReplayResult.valid > 0) {
      var mi = 0.0;
      if (i == 0) {
        mi = generalizedBalanceHeuristicPairwiseMIS_Canonical(X, Y, confidence, i, candidates, randomReplaysFromCanonicalToCandidate);
      } else {
        mi = generalizedBalanceHeuristicPairwiseMIS_NonCanonical(X, Y, confidence, i, candidates);
      }
      wi = mi * length(Y.F) * Wxi;
    }

    if (wi > 0.0) {
      let updated = updateReservoirWithConfidence(&r, Y, wi, confidence);
    } else {
      // we still need to update the confidence even after we fail
      r.c += Xi.c;
    }
  }

  if (r.isNull <= 0.0) {
    r.Wy = 1 / length(r.Y.F) * r.wSum;
    // we want to make sure that new samples don't alter
    // the first vertex seed, explanation in firstVertexSeed.md
    r.Y.firstVertexSeed = canonicalFirstVertexSeed;
  }

  r.c = clamp(r.c, 1.0, config.MAX_CONFIDENCE);

  return r;
}
`;

export let GBHBiased = /* wgsl */ `
fn Resample(
  candidates: array<Reservoir, MAX_SR_CANDIDATES_COUNT>, 
  domain: vec2u
) -> Reservoir {
  // ******* important: first candidate is the current pixel's reservoir ***********
  // ******* I should probably update this function to reflect that ***********

  var r = Reservoir(
    // it's important that we set the domain here, read
    // the note inside generalizedBalanceHeuristic to understand why.
    // In this case, it's important because for next spatial iterations
    // when we return the reservoir, we have to set it as a valid pixel, by
    // assigning something other that -1,-1 to the domain value
    PathInfo(vec3f(0.0), 0, 0, 0, 0, 0, -1, vec2f(0), vec3f(0), vec3f(0), vec2f(0), vec2i(-1)),
    vec2i(domain), candidates[0].Gbuffer, 0.0, 0.0, 0.0, 1.0, vec3f(0.0),
  );

  var M : i32 = config.RESTIR_SR_CANDIDATES;
  if (temporalResample) {
    M = config.RESTIR_TEMP_CANDIDATES;
  }

  let canonicalFirstVertexSeed = candidates[0].Y.firstVertexSeed;

  var activeCandidates = 0.0;
  for (var i: i32 = 0; i < M; i++) {
    if (candidates[i].isNull <= 0) {
      activeCandidates += 1.0;
    }
  }
  let mi = 1.0 / activeCandidates;

  for (var i: i32 = 0; i < M; i++) {
    /*
      since the very first candidate is this pixel's reservoir,
      I can probably avoid the random replay
      and optimize that part away
    */
    let Xi = candidates[i];
    if (Xi.isNull > 0) {
      // we weren't able to generate a path for this candidate, thus skip it

      // we still need to update the confidence though
      r.c += Xi.c;
      continue;
    }

    let randomReplayResult = randomReplay(Xi.Y, canonicalFirstVertexSeed, domain);
    // remember that the random-replay will end up creating a new path-info
    // that computed internally a different jacobian compared to the jacobian
    // that is saved in the original path Xi.Y. This is the real difference between
    // Y and X when it's presented in section 5 of the ReSTIR guide
    let X = Xi.Y;
    var Y = Xi.Y;
    Y.F = randomReplayResult.pHat;
    Y.jacobian = randomReplayResult.jacobian;

    let confidence = Xi.c;

    let jacobian = (Y.jacobian.x / X.jacobian.x) * abs(Y.jacobian.y / X.jacobian.y);
    let Wxi = Xi.Wy * jacobian;
    var wi = 0.0;

    if (randomReplayResult.valid > 0) {
      wi = mi * length(Y.F) * Wxi;
    }

    if (wi > 0.0) {
      let updated = updateReservoirWithConfidence(&r, Y, wi, confidence);
    } else {
      // we still need to update the confidence even after we fail
      r.c += Xi.c;
    }
  }

  if (r.isNull <= 0.0) {
    r.Wy = 1 / length(r.Y.F) * r.wSum;
    // we want to make sure that new samples don't alter
    // the first vertex seed, explanation in firstVertexSeed.md
    r.Y.firstVertexSeed = canonicalFirstVertexSeed;
  }

  r.c = clamp(r.c, 1.0, config.MAX_CONFIDENCE);

  return r;
}
`;
