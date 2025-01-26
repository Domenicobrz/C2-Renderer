import { Color, Vector2 } from 'three';
import { MATERIAL_TYPE, Material } from './material';
import { intBitsToFloat } from '$lib/utils/intBitsToFloat';

export class EONDiffuse extends Material {
  private color: Color;
  private roughness: number;
  private bumpStrength: number;
  private uvRepeat: Vector2;
  private mapUvRepeat: Vector2;

  constructor({
    color,
    roughness,
    map,
    bumpMap,
    bumpStrength = 1,
    uvRepeat = new Vector2(1, 1),
    mapUvRepeat = new Vector2(1, 1),
    flipTextureY = false
  }: {
    color: Color;
    roughness: number;
    map?: HTMLImageElement;
    bumpMap?: HTMLImageElement;
    bumpStrength?: number;
    uvRepeat?: Vector2;
    mapUvRepeat?: Vector2;
    flipTextureY?: boolean;
  }) {
    super({ flipTextureY });
    this.type = MATERIAL_TYPE.EON_DIFFUSE;
    this.color = color;
    this.roughness = roughness;
    this.bumpStrength = bumpStrength;
    this.uvRepeat = uvRepeat;
    this.mapUvRepeat = mapUvRepeat;
    this.offsetCount = 14;

    this.texturesLocation.map = new Vector2(-1, -1);
    this.texturesLocation.bumpMap = new Vector2(-1, -1);
    if (map) {
      this.textures.map = map;
    }
    if (bumpMap) {
      this.textures.bumpMap = bumpMap;
    }
  }

  getFloatsArray(): number[] {
    return [
      this.type,
      this.color.r,
      this.color.g,
      this.color.b,
      this.roughness,
      this.bumpStrength,
      this.uvRepeat.x,
      this.uvRepeat.y,
      this.mapUvRepeat.x,
      this.mapUvRepeat.y,
      // we'll store integers as floats and then bitcast them back into ints
      intBitsToFloat(this.texturesLocation.map.x),
      intBitsToFloat(this.texturesLocation.map.y),
      intBitsToFloat(this.texturesLocation.bumpMap.x),
      intBitsToFloat(this.texturesLocation.bumpMap.y)
    ];
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct EONDiffuse {
        color: vec3f,
        roughness: f32,
        bumpStrength: f32,
        uvRepeat: vec2f,
        mapUvRepeat: vec2f,
        mapLocation: vec2i,
        bumpMapLocation: vec2i,
      }
    `;
  }

  static shaderCreateStruct(): string {
    return /* wgsl */ `
      fn createEONDiffuse(offset: u32) -> EONDiffuse {
        var eonDiffuse: EONDiffuse;
        eonDiffuse.color = vec3f(
          materialsData[offset + 1],
          materialsData[offset + 2],
          materialsData[offset + 3],
        );
        eonDiffuse.roughness = materialsData[offset + 4];
        eonDiffuse.bumpStrength = materialsData[offset + 5];
        eonDiffuse.uvRepeat.x = materialsData[offset + 6];
        eonDiffuse.uvRepeat.y = materialsData[offset + 7];
        eonDiffuse.mapUvRepeat.x = materialsData[offset + 8];
        eonDiffuse.mapUvRepeat.y = materialsData[offset + 9];
        eonDiffuse.mapLocation = vec2i(
          bitcast<i32>(materialsData[offset + 10]),
          bitcast<i32>(materialsData[offset + 11]),
        );
        eonDiffuse.bumpMapLocation = vec2i(
          bitcast<i32>(materialsData[offset + 12]),
          bitcast<i32>(materialsData[offset + 13]),
        );
        return eonDiffuse;
      } 
    `;
  }

  static shaderShadeEONDiffuse(): string {
    return /* wgsl */ `
      const constant1_FON: f32 = 0.5 - 2.0 / (3.0 * PI);
      const constant2_FON: f32 = 2.0 / 3.0 - 28.0 / (15.0 * PI);

      fn E_FON_exact(mu: f32, r: f32) -> f32 {
        let AF = 1.0 / (1.0 + constant1_FON * r); // FON A coeff.
        let BF = r * AF; // FON B coeff.
        let Si = sqrt(1.0 - (mu * mu));
        let G = Si * (acos(mu) - Si * mu) + 
          (2.0 / 3.0) * ((Si / mu) * (1.0 - (Si * Si * Si)) - Si);
        return AF + (BF/PI) * G;
      }
      fn E_FON_approx(mu: f32, r: f32) -> f32 {
        let mucomp = 1.0 - mu;
        let mucomp2 = mucomp * mucomp;
        let Gcoeffs = mat2x2f(0.0571085289, -0.332181442, 0.491881867, 0.0714429953);
        let GoverPi = dot(Gcoeffs * vec2f(mucomp, mucomp2), vec2f(1.0, mucomp2));
        return (1.0 + r * GoverPi) / (1.0 + constant1_FON * r);
      }

      // Evaluates EON BRDF value, given inputs:
      //      rho = single-scattering albedo parameter
      //        r = roughness in [0, 1]
      // wi_local = direction of incident ray (directed away from vertex)
      // wo_local = direction of outgoing ray (directed away from vertex)
      //    exact = flag to select exact or fast approx. version
      //
      // Note that this implementation assumes throughout that the directions are
      // specified in a local space where the z-direction aligns with the surface normal.
      fn f_EON(rho: vec3f, r: f32, wi_local: vec3f, wo_local: vec3f, exact: bool) -> vec3f {
        let mu_i = wi_local.z; // input angle cos
        let mu_o = wo_local.z; // output angle cos
        let s = dot(wi_local, wo_local) - mu_i * mu_o; // QON s term
        
        // let sovertF = s > 0.0 ? s / max(mu_i, mu_o) : s; // FON s/t
        var sovertF = 0.0;
        if (s > 0.0) {
          sovertF = s / max(mu_i, mu_o);
        } else {
          sovertF = s;
        }
        
        let AF = 1.0 / (1.0 + constant1_FON * r); // FON A coeff.
        let f_ss = (rho / PI) * AF * (1.0 + r * sovertF); // single-scatter

        // float EFo = exact ? E_FON_exact(mu_o, r): // FON wo albedo (exact)
        // E_FON_approx(mu_o, r); // FON wo albedo (approx)
        var EFo = 0.0;
        if (exact) {
          EFo = E_FON_exact(mu_o, r);
        } else {
          EFo = E_FON_approx(mu_o, r);
        }
        
        // float EFi = exact ? E_FON_exact(mu_i, r): // FON wi albedo (exact)
          // E_FON_approx(mu_i, r); // FON wi albedo (approx)
        var EFi = 0.0;
        if (exact) {
          EFi = E_FON_exact(mu_i, r);
        } else {
          EFi = E_FON_approx(mu_i, r);
        }

        let avgEF = AF * (1.0 + constant2_FON * r); // avg. albedo
        let rho_ms = (rho * rho) * avgEF / (vec3f(1.0) - rho * (1.0 - avgEF));
        const eps = 1.0e-7;
        let f_ms = (rho_ms/PI) * max(eps, 1.0 - EFo) // multi-scatter lobe
          * max(eps, 1.0 - EFi)
          / max(eps, 1.0 - avgEF);

        return f_ss + f_ms;
      }

      fn orthonormal_basis_ltc(w: vec3f) -> mat3x3f {
        let lenSqr = dot(w.xy, w.xy);

        // let X = lenSqr > 0.0f ? vec3(w.x, w.y, 0.0f) * inversesqrt(lenSqr) : vec3(1, 0, 0);
        var X = vec3f(0.0);
        if (lenSqr > 0.0) {
          let inverseSquareRoot = 1.0 / sqrt(lenSqr);
          X = vec3f(w.x, w.y, 0.0) * inverseSquareRoot;
        } else {
          X = vec3f(1.0, 0.0, 0.0);
        }

        let Y = vec3f(-X.y, X.x, 0.0); // cross(Z, X)
        return mat3x3f(X, Y, vec3(0, 0, 1));
      }

      fn ltc_coeffs(
        mu: f32, r: f32,
        a: ptr<function, f32>, b: ptr<function, f32>, c: ptr<function, f32>, d: ptr<function, f32>
      ) {
        *a = 1.0 + r*(0.303392 + (-0.518982 + 0.111709*mu)*mu + (-0.276266 + 0.335918*mu)*r);
        *b = r*(-1.16407 + 1.15859*mu + (0.150815 - 0.150105*mu)*r)/(mu*mu*mu - 1.43545);
        *c = 1.0 + (0.20013 + (-0.506373 + 0.261777*mu)*mu)*r;
        *d = ((0.540852 + (-1.01625 + 0.475392*mu)*mu)*r)/(-1.0743 + mu*(0.0725628 + mu));
      }

      fn cltc_sample(wo_local: vec3f, r: f32, u1: f32, u2: f32) -> vec4f {
        var a: f32; var b: f32; var c: f32; var d: f32; 
        ltc_coeffs(wo_local.z, r, &a, &b, &c, &d); // coeffs of LTC M
        let R = sqrt(u1); 
        let phi = 2.0 * PI * u2; // CLTC sampling
        var x = R * cos(phi); 
        let y = R * sin(phi); // CLTC sampling
        let vz = 1.0 / sqrt(d*d + 1.0); // CLTC sampling factors
        let s = 0.5 * (1.0 + vz); // CLTC sampling factors
        x = -mix(sqrt(1.0 - y*y), x, s); // CLTC sampling
        let wh = vec3f(x, y, sqrt(max(1.0 - (x*x + y*y), 0.0))); // ωH sample via CLTC
        let pdf_wh = wh.z / (PI * s); // PDF of ωH sample
        var wi = vec3f(a*wh.x + b*wh.z, c*wh.y, d*wh.x + wh.z); // M ωH (unnormalized)
        let len = length(wi); // ∥M ωH∥ = 1/∥M−1 ωH∥
        let detM = c*(a - b*d); // |M|
        let pdf_wi = pdf_wh * len*len*len / detM; // ωi sample PDF
        let fromLTC = orthonormal_basis_ltc(wo_local); // ωi -> local space
        wi = normalize(fromLTC * wi); // ωi -> local space
        return vec4f(wi, pdf_wi);
      }

      fn cltc_pdf(wo_local: vec3f, wi_local: vec3f, r: f32) -> f32 {
        let toLTC = transpose(orthonormal_basis_ltc(wo_local)); // ωi -> LTC space
        let wi = toLTC * wi_local; // ωi -> LTC space
        var a: f32; var b: f32; var c: f32; var d: f32; 
        ltc_coeffs(wo_local.z, r, &a, &b, &c, &d); // coeffs of LTC M
        let detM = c*(a - b*d); // |M|
        let wh = vec3f(c*(wi.x - b*wi.z), (a - b*d)*wi.y, -c*(d*wi.x - a*wi.z)); // adj(M) ωi
        let lenSqr = dot(wh, wh);
        let vz = 1.0 / sqrt(d*d + 1.0); // CLTC sampling factors
        let s = 0.5 * (1.0 + vz); // CLTC sampling factors
        let pdf = detM*detM/(lenSqr*lenSqr) * max(wh.z, 0.0) / (PI * s); // wi sample PDF
        return pdf;
      }

      fn uniform_lobe_sample(u1: f32, u2: f32) -> vec3f {
        let sinTheta = sqrt(1.0 - u1*u1);
        let phi = 2.0 * PI * u2;
        return vec3f(sinTheta * cos(phi), sinTheta * sin(phi), u1);
      }

      fn sample_EON(wo_local: vec3f, r: f32, u1: f32, u2: f32) -> vec4f {
        let mu = wo_local.z;
        let P_u = pow(r, 0.1) * (0.162925 + mu*(-0.372058 + (0.538233 - 0.290822*mu)*mu));
        let P_c = 1.0 - P_u; // probability of CLTC sample
        var wi = vec4f(0.0); 
        var pdf_c = 0.0;

        if (u1 <= P_u) {
          let _u1 = u1 / P_u;
          wi = vec4f(uniform_lobe_sample(_u1, u2), 0.0); // sample wi from uniform lobe
          pdf_c = cltc_pdf(wo_local, wi.xyz, r); } // evaluate CLTC PDF at wi
        else {
          let _u1 = (u1 - P_u) / P_c;
          wi = cltc_sample(wo_local, r, _u1, u2); // sample wi from CLTC lobe
          pdf_c = wi.w; 
        }
       
        const pdf_u = 1.0 / (2.0 * PI);
        wi.w = P_u*pdf_u + P_c*pdf_c; // MIS PDF of wi
        
        return wi;
      }

      fn pdf_EON(wo_local: vec3f, wi_local: vec3f, r: f32) -> f32 {
        let mu = wo_local.z;
        let P_u = pow(r, 0.1) * (0.162925 + mu*(-0.372058 + (0.538233 - 0.290822*mu)*mu));
        let P_c = 1.0 - P_u;
        let pdf_c = cltc_pdf(wo_local, wi_local, r);
        const pdf_u = 1.0 / (2.0 * PI);
        return P_u*pdf_u + P_c*pdf_c;
      }

      fn shadeEONDiffuseSampleBRDF(
        rands: vec4f, 
        material: EONDiffuse,
        wo: vec3f,
        wi: ptr<function, vec3f>,
        worldSpaceRay: ptr<function, Ray>, 
        TBN: mat3x3f,
        brdf: ptr<function, vec3f>,
        pdf: ptr<function, f32>,
        misWeight: ptr<function, f32>
      ) {
        // *********************************************************************
        // if you switch to another brdf pdf, remember to also update the light sample brdf's pdf
        // *********************************************************************

        // // uniform hemisphere sampling:
        // let rand_1 = rands.x;
        // let rand_2 = rands.y;
        // let phi = 2.0 * PI * rand_1;
        // let root = sqrt(1 - rand_2 * rand_2);
        // // local space new ray direction
        // let newDir = vec3f(cos(phi) * root, sin(phi) * root, rand_2);
        // var brdfSamplePdf = 1 / (2 * PI);

        // // cosine-weighted hemisphere sampling:
        // let rand_1 = rands.x;
        // // if rand_2 is 0, both cosTheta and the pdf will be zero
        // let rand_2 = max(rands.y, 0.000001);
        // let phi = 2.0 * PI * rand_1;
        // let theta = acos(sqrt(rand_2));
        // let cosTheta = cos(theta);
        // let sinTheta = sin(theta);
        // // local space new ray direction
        // let newDir = vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
        // var brdfSamplePdf = cosTheta / PI;

        // CLTC sampling
        let sample = sample_EON(wo, material.roughness, rands.x, rands.y);
        let newDir = sample.xyz;
        let brdfSamplePdf = sample.w;

        *wi = newDir;
        *brdf = f_EON(material.color, material.roughness, *wi, wo, true);
        *pdf = brdfSamplePdf;

        let lightSamplePdf = getLightPDF(Ray((*worldSpaceRay).origin, normalize(TBN * *wi)));
        *misWeight = getMisWeight(brdfSamplePdf, lightSamplePdf);
      }

      fn shadeEONDiffuseSampleLight(
        rands: vec4f, 
        material: EONDiffuse,
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
        *brdf = f_EON(material.color, material.roughness, *wi, wo, true);

        // cosine-weighted pdf
        // let cosTheta = dot(lightSample.direction, N);
        // var brdfSamplePdf = cosTheta / PI;
        
        // CLTC pdf
        var brdfSamplePdf = pdf_EON(wo, *wi, material.roughness);

        // if the sampled ray sits below the hemisphere, brdfSamplePdf is zero,
        // since diffuse materials never sample a direction under the hemisphere.
        // However at this point, it doesn't even make sense to evaluate the 
        // rest of this function since we would be wasting a sample, thus we'll return
        // misWeight = 0 instead.
        if (
          brdfSamplePdf == 0.0 ||
          lightSample.pdf == 0.0
        ) {
          brdfSamplePdf = 0;
          *misWeight = 0; *pdf = 1; 
          *lightSampleRadiance = vec3f(0.0);
          return;
        }

        *lightSampleRadiance = lightSample.radiance;
        *misWeight = getMisWeight(lightSample.pdf, brdfSamplePdf);
      }

      fn shadeEONDiffuse(
        ires: BVHIntersectionResult, 
        ray: ptr<function, Ray>,
        reflectance: ptr<function, vec3f>, 
        lastBrdfMisWeight: ptr<function, f32>, 
        rad: ptr<function, vec3f>,
        tid: vec3u,
        i: i32
      ) {
        let hitPoint = ires.hitPoint;
        var material: EONDiffuse = createEONDiffuse(ires.triangle.materialOffset);

        if (material.mapLocation.x > -1) {
          material.color *= getTexelFromTextureArrays(material.mapLocation, ires.uv, material.mapUvRepeat).xyz;
        }

        var vertexNormal = ires.normal;
        // the normal flip is calculated using the geometric normal to avoid
        // black edges on meshes displaying strong smooth-shading via vertex normals
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
        // for Diffuse we can apply the bump offset if necessary
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


        // to my understanding, this model includes the 
        // reflectance *= material.color multiplication
        // in the brdf itself. We'll use this convention everywhere else inside C2


        if (config.MIS_TYPE == BRDF_ONLY) {
          var pdf: f32; var w: f32; var brdf: vec3f;
          shadeEONDiffuseSampleBRDF(rands1, material, wo, &wi, ray, TBN, &brdf, &pdf, &w);
          (*ray).direction = normalize(TBN * wi);
          (*ray).origin += (*ray).direction * 0.001;
          *reflectance *= (brdf / pdf) * max(dot(N, (*ray).direction), 0.0);
          *lastBrdfMisWeight = 1.0;
        }

        if (config.MIS_TYPE == NEXT_EVENT_ESTIMATION) {
          var brdfSamplePdf: f32; var brdfMisWeight: f32; 
          var brdfSampleBrdf: vec3f;

          var lightSampleBrdf: vec3f; var lightSamplePdf: f32; var lightMisWeight: f32;  
          var lightRadiance: vec3f; var lightSampleWi: vec3f;

          var rayBrdf = Ray((*ray).origin, (*ray).direction);
          var rayLight = Ray((*ray).origin, (*ray).direction);

          // the reason why we're guarding NEE with this if statement is explained in the docs
          if (debugInfo.bounce < config.BOUNCES_COUNT - 1) {
            shadeEONDiffuseSampleLight(
              rands2, material, wo, &lightSampleWi, &rayLight, TBN, TBNinverse,
              &lightSampleBrdf, &lightSamplePdf, &lightMisWeight, &lightRadiance
            );
            // from tangent space to world space
            lightSampleWi = normalize(TBN * lightSampleWi);
            // light contribution
            *rad += *reflectance * lightRadiance * lightSampleBrdf * (lightMisWeight / lightSamplePdf) * max(dot(N, lightSampleWi), 0.0);
          }

          shadeEONDiffuseSampleBRDF(
            rands1, material, wo, &wi, &rayBrdf, TBN, &brdfSampleBrdf, &brdfSamplePdf, 
            &brdfMisWeight
          );
          (*ray).direction = normalize(TBN * wi);
          (*ray).origin += (*ray).direction * 0.001;
          
          *reflectance *= brdfSampleBrdf * (1.0 / brdfSamplePdf) * max(dot(N, (*ray).direction), 0.0);    
          *lastBrdfMisWeight = brdfMisWeight;
        }
      }
    `;
  }
}
