export const shadingNormalsPart = /* wgsl */ `
  fn getShadingNormal(
    mapLocation: vec2i, strength: f32, normal: vec3f, ray: Ray, 
    hitP: vec3f, uv: vec2f, triangle: Triangle,
  ) -> vec3f {
    var uv1: vec2f;
    var uv2: vec2f;

    let resolution = mapLocation.x;
    if (resolution == 0) {
      uv1 = uv + vec2f(1.0 / 128.0, 0.0);
      uv2 = uv + vec2f(0.0, 1.0 / 128.0);
    }
    if (resolution == 1) {
      uv1 = uv + vec2f(1.0 / 512.0, 0.0);
      uv2 = uv + vec2f(0.0, 1.0 / 512.0);
    }
    if (resolution == 2) {
      uv1 = uv + vec2f(1.0 / 1024.0, 0.0);
      uv2 = uv + vec2f(0.0, 1.0 / 1024.0);
    }
    
    if (uv1.x >= 1.0) { uv1.x = 0.0; }
    if (uv1.y >= 1.0) { uv1.y = 0.0; }
    if (uv2.x >= 1.0) { uv2.x = 0.0; }
    if (uv2.y >= 1.0) { uv2.y = 0.0; }

    let t0 = getTexelFromTextureArrays(mapLocation, uv)  * strength;
    let t1 = getTexelFromTextureArrays(mapLocation, uv1) * strength;
    let t2 = getTexelFromTextureArrays(mapLocation, uv2) * strength;
    // https://developer.download.nvidia.com/CgTutorial/cg_tutorial_chapter08.html
    let tx = vec3f(1.0, 0.0, t1.x - t0.x);
    let ty = vec3f(0.0, 1.0, t2.x - t0.x);
    let sn = normalize(cross(tx, ty));

    let tbn = getNormalMapTangentFrame(ray, hitP, uv, triangle, normal);
    let framedNormal = normalize( tbn * sn );

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
