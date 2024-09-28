export const shadingNormalsPart = /* wgsl */ `
  fn getShadingNormal(
    mapLocation: vec2i, strength: f32, normal: vec3f, ray: Ray, 
    hitP: vec3f, uv: vec2f, triangle: Triangle, rayOffset: ptr<function, f32>
  ) -> vec3f {
    var uv1: vec2f;
    var uv2: vec2f;
    var textureSize = 0.0;

    let resolution = mapLocation.x;
    if (resolution == 0) {
      uv1 = uv + vec2f(1.0 / 128.0, 0.0);
      uv2 = uv + vec2f(0.0, 1.0 / 128.0);
      textureSize = 128.0;
    }
    if (resolution == 1) {
      uv1 = uv + vec2f(1.0 / 512.0, 0.0);
      uv2 = uv + vec2f(0.0, 1.0 / 512.0);
      textureSize = 512.0;
    }
    if (resolution == 2) {
      uv1 = uv + vec2f(1.0 / 1024.0, 0.0);
      uv2 = uv + vec2f(0.0, 1.0 / 1024.0);
      textureSize = 1024.0;
    }
    
    if (uv1.x >= 1.0) { uv1.x = 0.0; }
    if (uv1.y >= 1.0) { uv1.y = 0.0; }
    if (uv2.x >= 1.0) { uv2.x = 0.0; }
    if (uv2.y >= 1.0) { uv2.y = 0.0; }

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
    let texelSideLength = sqrt(triangle.area) / (sqrt(triangle.uvArea) * textureSize); 

    let t0 = getTexelFromTextureArrays(mapLocation,  uv).x * texelSideLength * strength;
    let t1 = getTexelFromTextureArrays(mapLocation, uv1).x * texelSideLength * strength;
    let t2 = getTexelFromTextureArrays(mapLocation, uv2).x * texelSideLength * strength;

    // https://developer.download.nvidia.com/CgTutorial/cg_tutorial_chapter08.html
    let tx = vec3f(texelSideLength, 0.0, t1 - t0);
    let ty = vec3f(0.0, texelSideLength, t2 - t0);
    let sn = normalize(cross(tx, ty));

    let tbn = getNormalMapTangentFrame(ray, hitP, uv, triangle, normal);
    let framedNormal = normalize( tbn * sn );

    *rayOffset = t0;

    return framedNormal;
  }

  fn getNormalMapTangentFrame(ray: Ray, hitP: vec3f, uv: vec2f, triangle: Triangle, normal: vec3f) -> mat3x3f {
    let ires0 = intersectTriangleWithDerivativeRay(triangle, Ray(ray.origin, deltaDirX));
    let ires1 = intersectTriangleWithDerivativeRay(triangle, Ray(ray.origin, deltaDirY));
    
    let q0 = ires0.hitPoint - hitP;
    let q1 = ires1.hitPoint - hitP;
    let st0 = ires0.uv - uv;
    let st1 = ires1.uv - uv;

    let N = normal; 

	  let q1perp = cross( q1, N );
    // had to switch this one up to change the handedness of the computations
    // let q0perp = cross( N, q0 );
	  let q0perp = cross( q0, N );

	  let T = q1perp * st0.x + q0perp * st1.x;
	  let B = q1perp * st0.y + q0perp * st1.y;

	  let det = max( dot( T, T ), dot( B, B ) );
	  
    var scale = inverseSqrt( det ); 
    if ( det == 0.0 ) { scale = 0.0; }

                // had to add -T to switch the handedness of the computations 
                // (to be frank though, while I was experimenting I forgot to remove
                // this minus sign, and it ended up producing the correct result
                // ...if it looks good, it's correct!)
	  return mat3x3f( -T * scale, B * scale, N );
  }
`;
