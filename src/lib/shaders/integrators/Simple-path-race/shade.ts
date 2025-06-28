import { MATERIAL_TYPE } from '$lib/materials/material';

export const shade = /* wgsl */ `
fn shade(
  ires: BVHIntersectionResult, 
  ray: ptr<function, Ray>,
  rad: ptr<function, vec3f>,
  throughput: ptr<function, vec3f>, 
  lastBrdfMis: ptr<function, f32>, 
) {
  let triangle = triangles[ires.triangleIndex];

  var material = EvaluatedMaterial();
  var geometryContext = GeometryContext();
  evaluateMaterialAndGeometryContext(ires, *ray, &material, &geometryContext, false);
  let materialType = material.materialType;

  let normals = geometryContext.normals;

  // TODO:
  // v v v v v  this whole thing stinks and I don't understand it anymore, refactor it v v v v v
  // v v v v v  this whole thing stinks and I don't understand it anymore, refactor it v v v v v
  // v v v v v  this whole thing stinks and I don't understand it anymore, refactor it v v v v v
  // needs to be the exact origin, such that getLightSample/getLightPDF can apply a proper offset 
  (*ray).origin = ires.hitPoint;
  // in practice however, only for Dielectrics we need the exact origin, 
  // for TorranceSparrow/Diffuse we can apply the bump offset if necessary
  if (materialType != ${MATERIAL_TYPE.DIELECTRIC}) {
    if (geometryContext.bumpOffset > 0.0) {
      (*ray).origin += normals.vertex * geometryContext.bumpOffset;
    }
  }
  geometryContext.ray = *ray;

  var emissive = getEmissive(material, geometryContext.isBackFacing);
  *rad += emissive * *lastBrdfMis * *throughput;

  // absorption check for dielectrics
  if (materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
    var isInsideMedium = dot(normals.shading, (*ray).direction) > 0;
        
    // beer-lambert absorption 
    if (isInsideMedium) {
      let absorption = vec3f(
        exp(-material.absorptionCoefficient.x * ires.t), 
        exp(-material.absorptionCoefficient.y * ires.t), 
        exp(-material.absorptionCoefficient.z * ires.t), 
      );

      *throughput *= absorption;
    }
  }

  let brdfSample = sampleBrdf(material, geometryContext);
  var lightSample = LightDirectionSample(vec3f(0), 0, 0, vec3f(0), LightSample());
  // the reason why we're guarding NEE with this if statement is explained in the segment/integrators/mis-explanation.png
  if (debugInfo.bounce < config.BOUNCES_COUNT - 1) {
    lightSample = sampleLight(material, geometryContext);

    let lightRadiance = lightSample.ls.radiance;
    let lightSampleSuccessful = dot(lightRadiance, lightRadiance) > 0.0;
      
    if (lightSampleSuccessful) {
      *rad += lightRadiance * lightSample.mis * *throughput *
        lightSample.brdf / lightSample.pdf * cosTerm(normals.shading, lightSample.dir, materialType);
    }
  }

  // now you have to actually change ray.direction to reflect the new direction
  (*ray).origin += brdfSample.dir * 0.001;
  (*ray).direction = brdfSample.dir;

  *lastBrdfMis = brdfSample.mis;
  var t = brdfSample.brdf * (/* mis weight */ 1.0 / brdfSample.pdf);
  t *= cosTerm(normals.shading, brdfSample.dir, materialType);

  *throughput *= t;
}
`;
