export let tempEmissive2 = /* wgsl */ `

fn sampleEmissiveBrdf(
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>, 
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> BrdfDirectionSample {
  let rands = vec4f(getRand2D(), getRand2D());

  let r0 = 2.0 * PI * rands.x;
  let r1 = acos(rands.y);
  let nd = normalize(vec3f(
    sin(r0) * sin(r1),
    cos(r1),
    cos(r0) * sin(r1),
  ));

  var tangent = vec3f(0.0);
  var bitangent = vec3f(0.0);
  getTangentFromTriangle(
    surfaceAttributes.tangent, surfaceNormals.geometric, surfaceNormals.shading, 
    &tangent, &bitangent
  );

  // https://learnopengl.com/Advanced-Lighting/Normal-Mapping
  let TBN = mat3x3f(tangent, bitangent, surfaceNormals.shading);
  // from tangent space to world space
  let newDirection = normalize(TBN * nd.xzy);
  const brdfSamplePdf = 1 / (2 * PI);
  const brdf = vec3f(1 / PI);
  const misWeight = 1.0;

  return BrdfDirectionSample(
    brdf,
    brdfSamplePdf,
    misWeight,
    newDirection,
  );
}

fn sampleEmissiveLight(
  materialData: array<f32, MATERIAL_DATA_ELEMENTS>, 
  ray: ptr<function, Ray>,
  surfaceAttributes: SurfaceAttributes,
  surfaceNormals: SurfaceNormals,
) -> LightDirectionSample {
  return LightDirectionSample(
    vec3f(0.0),
    1,
    0,
    vec3f(0.0),
    LightSample(),
  );
}
`;
