import type { ReSTIRConfigManager } from '$lib/config';
import { GBHBiased, GBHPairWise, GBHStandard } from './gbhVariants';

export function resampleLogic(configManager: ReSTIRConfigManager) {
  return /* wgsl */ `
fn randomReplay(pi: PathInfo, firstVertexSeed: u32, tid: vec2u) -> RandomReplayResult {
  let idx = tid.y * canvasSize.x + tid.x;

  // explained in segment/integrators/firstVertexSeed.md
  initializeRandoms(firstVertexSeed);
  var rayContribution: f32;
  var ray = getCameraRay(vec3u(tid, 0), idx, &rayContribution);

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
      let rrStepResult = shade(
        ires, &ray, &unusedReservoir, &throughput, &pathInfoCopy, &pathSampleInfo, &lastBrdfMis, true, vec3u(tid, 0), i
      );

      if (rrStepResult.shouldTerminate) {
        return rrStepResult;
      }
    } else if (shaderConfig.HAS_ENVMAP) {
      // we bounced off into the envmap
      let envmapRad = getEnvmapRadiance(ray.direction);
      let rrStepResult = rrEnvmapPathConstruction( 
        &pathInfoCopy, &lastBrdfMis, &throughput, envmapRad,
      );

      if (rrStepResult.shouldTerminate) {
        return rrStepResult;
      }
    }
    // ..... missing stuff .....
  }

  return RandomReplayResult(0, vec3f(0), true, vec2f(0.0));
}

${/* GBHStandard */ ''}
${configManager.options.ReSTIR.GBH_VARIANT == 'Pairwise MIS' ? GBHPairWise : ''}
${configManager.options.ReSTIR.GBH_VARIANT == '1/M Biased' ? GBHBiased : ''}
`;
}
