export const resampleLogic = /* wgsl */ `
const MAX_CONFIDENCE = 5.0;

fn randomReplay(pi: PathInfo, firstVertexSeed: u32, tid: vec3u, i: i32) -> RandomReplayResult {
  let idx = tid.y * canvasSize.x + tid.x;

  // explained in segment/integrators/firstVertexSeed.md
  initializeRandoms(firstVertexSeed);
  var rayContribution: f32;
  var ray = getCameraRay(tid, idx, &rayContribution);

  // then we'll use the path-info seed number, and also have to remember to
  // skip the camera randoms
  // read segments/integrators/doc1.png to understand why this is necessary
  initializeRandoms(pi.seed);
  getRand2D(); getRand2D();
  if (camera.catsEyeBokehEnabled > 0) {
    // *********** ERROR ************
    // *********** ERROR ************
    // *********** ERROR ************
    // This wasn't implemented since the catseyedbokeh routine asks for
    // rand 2ds in a for loop and then uses those rands to decide where to
    // continue the for loop or not
    return RandomReplayResult(0, vec3f(0), true, vec2f(0.0));
  }

  var lastBrdfMis = 1.0;
  var throughput = vec3f(1.0);
  var rad = vec3f(0.0);
  var unusedReservoir = Reservoir();
  var pathSampleInfo = PathSampleInfo(false, vec3f(0.0), vec3f(0.0), 0, 0, -1, vec3f(1.0), -1);
  var pathInfoCopy = pi;
  for (var i = 0; i < config.BOUNCES_COUNT; i++) {
    if (rayContribution == 0.0) { break; }

    debugInfo.bounce = i;

    let ires = bvhIntersect(ray);

    if (ires.hit) {
      let rrStepResult = shade(ires, &ray, &unusedReservoir, &throughput, &pathInfoCopy, &pathSampleInfo, &lastBrdfMis, true, tid, i);

      if (rrStepResult.shouldTerminate) {
        return rrStepResult;
      }
    }
    // ..... missing stuff .....
  }

  return RandomReplayResult(0, vec3f(0), true, vec2f(0.0));
}

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

    // shift Y into Xj's pixel
    let randomReplayResult = randomReplay(Y, XjCandidate.Y.firstVertexSeed, vec3u(XjCandidate.domain), i);
    if (randomReplayResult.valid > 0) {
      // shift Y -> Xj and evaluate jacobian
      var Xj = Y;
      Xj.F = randomReplayResult.pHat;
      Xj.jacobian = randomReplayResult.jacobian;

      // since we're doing y->xj,  the xj terms appear on top of the fraction
      let J = (Xj.jacobian.x / Y.jacobian.x) * abs(Xj.jacobian.y / Y.jacobian.y);
      let XjConfidence = XjCandidate.c;
      let res = XjConfidence * length(Xj.F) * J;

      denominator += res;
    }
  }

  //  TODO: what to do in this case? it did happen
  if (numerator == 0 || denominator == 0) { return 0; }

  return numerator / denominator;
}

fn SpatialResample(
  candidates: array<Reservoir, MAX_SR_CANDIDATES_COUNT>, 
  domain: vec3u
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
    vec3i(domain), candidates[0].Gbuffer, 0.0, 0.0, 0.0, 1.0, vec3f(0.0),
  );

  var M : i32 = config.RESTIR_SR_CANDIDATES;
  if (temporalResample) {
    M = config.RESTIR_TEMP_CANDIDATES;
  }

  let canonicalFirstVertexSeed = candidates[0].Y.firstVertexSeed;

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

    let randomReplayResult = randomReplay(Xi.Y, canonicalFirstVertexSeed, domain, i);
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
      var mi = generalizedBalanceHeuristic(X, Y, confidence, i, candidates);
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

  r.c = clamp(r.c, 1.0, MAX_CONFIDENCE);

  return r;
}`;
