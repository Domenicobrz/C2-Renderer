export const shadingNormalsPart = /* wgsl */ `
  fn getShadingNormal(
    mapLocation: vec2i, strength: f32, uvRepeat: vec2f, surfaceAttributes: SurfaceAttributes, ray: Ray, 
    triangle: Triangle, rayOffset: ptr<function, f32>
  ) -> vec3f {
    let uv = surfaceAttributes.uv; 
    let vertexNormal = surfaceAttributes.normal;
    let vertexTangent = surfaceAttributes.tangent;
    
    var uv1: vec2f;
    var uv2: vec2f;
    var textureSize = 0.0;

    let resolution = mapLocation.x;
    if (resolution == 0) {
      uv1 = uv + vec2f(1.0 / 128.0, 0.0) / uvRepeat;
      uv2 = uv + vec2f(0.0, 1.0 / 128.0) / uvRepeat;
      textureSize = 128.0;
    }
    if (resolution == 1) {
      uv1 = uv + vec2f(1.0 / 512.0, 0.0) / uvRepeat;
      uv2 = uv + vec2f(0.0, 1.0 / 512.0) / uvRepeat;
      textureSize = 512.0;
    }
    if (resolution == 2) {
      uv1 = uv + vec2f(1.0 / 1024.0, 0.0) / uvRepeat;
      uv2 = uv + vec2f(0.0, 1.0 / 1024.0) / uvRepeat;
      textureSize = 1024.0;
    }

    /* 
    the length of the texel in world space is useful to calculate a ray-offset
    to displace the ray along the normal
    the equation to calculate the length of the texel in world space is:
     
         Area(triangle) 
    ------------------------ = side^2
    Area(uv) * textureSize^2
    
    to lessen floating point precision errors I'm instead computing:

            sqrt(At)
    ----------------------- = side
    sqrt(Auv) * textureSize 
    */
    
    let tuv1uv0 = vec3f(triangle.uv1.x - triangle.uv0.x, triangle.uv1.y - triangle.uv0.y, 0) * vec3f(uvRepeat, 0.0);
    let tuv2uv0 = vec3f(triangle.uv2.x - triangle.uv0.x, triangle.uv2.y - triangle.uv0.y, 0) * vec3f(uvRepeat, 0.0);
    let triangleUvArea = length(cross(tuv1uv0, tuv2uv0)) * 0.5;

    let texelSideLength = sqrt(triangle.area) / (sqrt(triangleUvArea) * textureSize); 

    let t0 = getTexelFromTextureArrays(mapLocation,  uv, uvRepeat).x * texelSideLength * strength;
    let t1 = getTexelFromTextureArrays(mapLocation, uv1, uvRepeat).x * texelSideLength * strength;
    let t2 = getTexelFromTextureArrays(mapLocation, uv2, uvRepeat).x * texelSideLength * strength;

    // https://developer.download.nvidia.com/CgTutorial/cg_tutorial_chapter08.html
    let tx = vec3f(texelSideLength, 0.0, t1 - t0);
    let ty = vec3f(0.0, texelSideLength, t2 - t0);
    let sn = normalize(cross(tx, ty));

    // https://learnopengl.com/Advanced-Lighting/Normal-Mapping
    var tangent = vec3f(0.0);
    var bitangent = vec3f(0.0);
    getTangentFromTriangle(vertexTangent, triangle.geometricNormal, vertexNormal, &tangent, &bitangent);
    
    // negated bitangent to switch handedness
    // I think bump / normal maps are authored with a right-handed system in mind
    // where z points towards "us"
    let tbn = mat3x3f(tangent, -bitangent, vertexNormal);
    let framedNormal = normalize( tbn * sn );
    
    // for now we're disabling real ray offsets calculations since they cause issues
    // when applying textures to large planes, I'm instead only applying a small epsilon
    // *rayOffset = t0;
    *rayOffset = 0.000001;
    return framedNormal;
  }
`;
