import { TorranceSparrow } from '$lib/materials/torranceSparrow';

export const tempTorranceSparrowCopy = /* wgsl */ `
// https://blog.selfshadow.com/publications/turquin/ms_comp_final.pdf
fn multiScatterCompensationTorranceSparrow(F0: vec3f, wo: vec3f, roughness: f32) -> vec3f {
  let ESSwo = getLUTvalue(
    vec3f(roughness, saturate(wo.z /* dot(wo, norm) */), 0),
    LUT_MultiScatterTorranceSparrow, 
  ).x;

  let multiScatteringCoefficient = (1.0 + F0 * (1.0 - ESSwo) / ESSwo);
  return multiScatteringCoefficient;
}

fn shadeTorranceSparrowSampleBRDF(
  rands: vec4f, 
  material: TORRANCE_SPARROW,
  wo: vec3f,
  wi: ptr<function, vec3f>,
  worldSpaceRay: ptr<function, Ray>, 
  TBN: mat3x3f,
  brdf: ptr<function, vec3f>,
  pdf: ptr<function, f32>,
  misWeight: ptr<function, f32>,
) {
  TS_Sample_f(wo, rands.xy, material.ax, material.ay, material.color, wi, pdf, brdf);
  *brdf *= multiScatterCompensationTorranceSparrow(material.color, wo, material.roughness);
  
  let lightSamplePdf = getLightPDF(Ray((*worldSpaceRay).origin, normalize(TBN * *wi)));
  *misWeight = getMisWeight(*pdf, lightSamplePdf);
}

fn shadeTorranceSparrowSampleLight(
  rands: vec4f, 
  material: TORRANCE_SPARROW,
  wo: vec3f,
  wi: ptr<function, vec3f>,
  worldSpaceRay: ptr<function, Ray>, 
  TBN: mat3x3f,
  TBNinverse: mat3x3f,
  brdf: ptr<function, vec3f>,
  pdf: ptr<function, f32>,
  misWeight: ptr<function, f32>,
  lightSampleRadiance: ptr<function, vec3f>,
) {
  let lightSample = getLightSample(worldSpaceRay.origin, rands);
  *pdf = lightSample.pdf;
  let backSideHit = lightSample.backSideHit;

  // from world-space to tangent-space
  *wi = TBNinverse * lightSample.direction;
  
  var brdfSamplePdf = TS_PDF(wo, *wi, material.ax, material.ay);
  *brdf = TS_f(wo, *wi, material.ax, material.ay, material.color);
  *brdf *= multiScatterCompensationTorranceSparrow(material.color, wo, material.roughness);

  if (
    brdfSamplePdf == 0.0 || 
    lightSample.pdf == 0.0
  ) {
    *misWeight = 0; *pdf = 1; 
    *lightSampleRadiance = vec3f(0.0);
    // this will avoid NaNs when we try to normalize wi
    *wi = vec3f(-1);
    return;
  }

  *lightSampleRadiance = lightSample.radiance;
  *misWeight = getMisWeight(lightSample.pdf, brdfSamplePdf);
}


fn shadeTorranceSparrow(
  ires: BVHIntersectionResult, 
  ray: ptr<function, Ray>,
  reservoir: ptr<function, Reservoir>,
  throughput: ptr<function, vec3f>, 
  pi: PathInfo,
  psi: ptr<function, PathSampleInfo>,
  lastBrdfMis: ptr<function, f32>, 
  isRandomReplay: bool,
  tid: vec3u,
  i: i32
) -> RandomReplayResult {
  let hitPoint = ires.hitPoint;
  var material: TORRANCE_SPARROW = createTorranceSparrow(ires.triangle.materialOffset);

  if (material.mapLocation.x > -1) {
    material.color *= getTexelFromTextureArrays(
      material.mapLocation, ires.uv, material.mapUvRepeat
    ).xyz;
  }
  if (material.roughnessMapLocation.x > -1) {
    let roughness = getTexelFromTextureArrays(
      material.roughnessMapLocation, ires.uv, material.uvRepeat
    ).xy;
    material.roughness *= roughness.x;
    material.roughness = max(material.roughness, ${TorranceSparrow.MIN_INPUT_ROUGHNESS});
  }

  let axay = anisotropyRemap(material.roughness, material.anisotropy);
  material.ax = axay.x;
  material.ay = axay.y;

  var vertexNormal = ires.normal;
  if (dot(ires.triangle.geometricNormal, (*ray).direction) > 0) {
    vertexNormal = -vertexNormal;
  }
  var N = vertexNormal;
  var bumpOffset: f32 = 0.0;
  if (material.bumpMapLocation.x > -1) {
    N = getShadingNormal(
      material.bumpMapLocation, material.bumpStrength, material.uvRepeat, N, *ray, 
      ires, &bumpOffset
    );
  }

  // needs to be the exact origin, such that getLightSample/getLightPDF can apply a proper offset 
  (*ray).origin = ires.hitPoint;
  // in practice however, only for Dielectrics we need the exact origin, 
  // for TorranceSparrow we can apply the bump offset if necessary
  if (bumpOffset > 0.0) {
    (*ray).origin += vertexNormal * bumpOffset;
  }

  // rands1.xy is used for brdf samples
  // rands2.xyz is used for light samples (getLightSample(...) uses .xyz)
  let rands1 = vec4f(getRand2D(), getRand2D());
  let rands2 = vec4f(getRand2D(), getRand2D());

  // we need to calculate a TBN matrix
  var tangent = vec3f(0.0);
  var bitangent = vec3f(0.0);
  getTangentFromTriangle(ires, ires.triangle, N, &tangent, &bitangent);

  // normal could be flipped at some point, should we also flip TB?
  // https://learnopengl.com/Advanced-Lighting/Normal-Mapping
  let TBN = mat3x3f(tangent, bitangent, N);
  // to transform vectors from world space to tangent space, we multiply by
  // the inverse of the TBN
  let TBNinverse = transpose(TBN);

  var wi = vec3f(0,0,0); 
  let wo = TBNinverse * -(*ray).direction;

  var rrStepResult = RandomReplayResult(0, vec3f(0.0), false, vec2f(0.0));

  var brdfSamplePdf: f32; var brdfMisWeight: f32; 
  var brdfSampleBrdf: vec3f; 

  var lightSamplePdf: f32; var lightMisWeight: f32; 
  var lightRadiance: vec3f; var lightSampleBrdf: vec3f;
  var lightSampleWi: vec3f;

  var rayCopy = Ray((*ray).origin, (*ray).direction);

  shadeTorranceSparrowSampleBRDF(
    rands1, material, wo, &wi, &rayCopy, TBN, &brdfSampleBrdf, &brdfSamplePdf, &brdfMisWeight
  );
  
  // the reason why we're guarding NEE with this if statement is explained in the segment/integrators/mis-explanation.png
  if (debugInfo.bounce < config.BOUNCES_COUNT - 1) {
    shadeTorranceSparrowSampleLight(
      rands2, material, wo, &lightSampleWi, &rayCopy, TBN, TBNinverse, 
      &lightSampleBrdf, &lightSamplePdf, &lightMisWeight, &lightRadiance
    );

    if (length(lightRadiance) > 0.0) {
      // from tangent space to world space
      lightSampleWi = normalize(TBN * lightSampleWi);

      var mi = lightMisWeight;
      let pHat = lightRadiance * (lightSampleBrdf / lightSamplePdf) * *throughput * 
                 max(dot(N, lightSampleWi), 0.0);
      let Wxi = 1.0;
      let lobeIndex: u32 = 3;
  
      let wi = mi * length(pHat) * Wxi;
      if (isRandomReplay) {
        if (pi.bounceCount == u32(debugInfo.bounce) && pathIsLightSampled(pi) && pathHasLobeIndex(pi, lobeIndex)) {
          rrStepResult.valid = 1;
          // why do we have to multiply by "mi" here and in the pathinfo struct below to fix 
          // some issues related to correct convergence to the right result?
          // I could be wrong, but I think the rationale is this:
          // when we do spatial-reuse, inside the generalized balance heuristic we are
          // effectively posing this question (in the denominator loop): 
          // what was the likelyhood of this path being
          // generated by pixel xyz? that probability, requires modulation by "mi".
          // because effectively the probability of selecting a specific path is:
          // wi = mi * pHat * Wxi
          // thus the reservoir will choose that path with a probability that also depends on "mi"
          rrStepResult.pHat = pHat * mi;
        }
      } else {
        let pathInfo = PathInfo(
          pHat * mi,
          vec2i(tid.xy),
          u32(debugInfo.bounce),
          setPathFlags(lobeIndex, 1, 0, NO_RECONNECTION), // set flags to "path ends by NEE"
          0, -1, vec2f(0), vec3f(0), vec2f(0)
        );
    
        // updateReservoir uses a different set of random numbers, exclusive for ReSTIR
        updateReservoir(reservoir, pathInfo, wi);
      }
    }

  }

  (*ray).direction = normalize(TBN * wi);
  (*ray).origin += (*ray).direction * 0.001;
  
  *throughput *= brdfSampleBrdf * (1.0 / brdfSamplePdf) * max(dot(N, (*ray).direction), 0.0);
  *lastBrdfMis = brdfMisWeight;

  return rrStepResult;
} 
`;
