import { Vector2 } from 'three';

export const MATERIAL_TYPE = {
  DIFFUSE: 0,
  EMISSIVE: 1,
  TORRANCE_SPARROW: 2,
  DIELECTRIC: 3,
  EON_DIFFUSE: 4
};

export class Material {
  public offsetCount: number;
  public textures: Record<string, HTMLImageElement> = {};
  public texturesLocation: Record<string, Vector2> = {};
  public flipTextureY: boolean = false;

  protected type: number;

  constructor({ flipTextureY }: { flipTextureY: boolean }) {
    this.type = -1;
    this.offsetCount = 0;
    this.flipTextureY = flipTextureY;
  }

  getFloatsArray(): number[] {
    return [this.type];
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct EvaluatedMaterial {
        // "type" is a reserved word in wgsl, had to use "materialType" instead
        materialType: u32,

        baseColor: vec3f,
        absorptionCoefficient: vec3f,
        emissiveIntensity: f32, 
        
        ax: f32,
        ay: f32,
        roughness: f32, 
        anisotropy: f32,
        eta: f32,

        bumpStrength: f32,

        uvRepeat: vec2f,
        mapUvRepeat: vec2f,

        mapLocation: vec2i,
        bumpMapLocation: vec2i,
        roughnessMapLocation: vec2i,
      } 

      struct BrdfDirectionSample {
        brdf: vec3f,
        pdf: f32, 
        mis: f32,
        dir: vec3f,
      }
      
      struct LightDirectionSample {
        brdf: vec3f,
        pdf: f32, 
        mis: f32,
        dir: vec3f,
        ls: LightSample,
      }
      
      fn evaluateLobePdf(
        material: EvaluatedMaterial, 
        wo: vec3f,
        wi: vec3f,
        surfaceAttributes: SurfaceAttributes,
        surfaceNormals: SurfaceNormals,
      ) -> f32 {
        let materialType = material.materialType;
      
        if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
          return evaluatePdfDiffuseLobe(wi, surfaceNormals);
        }
      
        if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
          return evaluatePdfEmissiveLobe();
        }
      
        if (materialType == ${MATERIAL_TYPE.TORRANCE_SPARROW}) {
          return evaluatePdfTSLobe(wo, wi, material);
        }
      
        if (materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
          return evaluatePdfDielectricLobe(wo, wi, material);
        }
      
        return 0.0;
      }

      fn evaluateBrdf(
        material: EvaluatedMaterial, 
        wo: vec3f,
        wi: vec3f,
        surfaceAttributes: SurfaceAttributes,
        surfaceNormals: SurfaceNormals,
      ) -> vec3f {
        let materialType = material.materialType;
      
        if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
          return evaluateDiffuseBrdf(material, surfaceAttributes);
        }
      
        if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
          return evaluateEmissiveBrdf();
        }
      
        if (materialType == ${MATERIAL_TYPE.TORRANCE_SPARROW}) {
          return evaluateTSBrdf(wo, wi, material);
        }
      
        if (materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
          return evaluateDielectricBrdf(wo, wi, material);
        }
      
        return vec3f(0);
      }

      fn sampleBrdf(
        material: EvaluatedMaterial, 
        ray: ptr<function, Ray>,
        surfaceAttributes: SurfaceAttributes,
        surfaceNormals: SurfaceNormals,
      ) -> BrdfDirectionSample {
        let materialType = material.materialType;
      
        if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
          return sampleDiffuseBrdf(material, ray, surfaceAttributes, surfaceNormals);
        }
      
        if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
          return sampleEmissiveBrdf(material, ray, surfaceAttributes, surfaceNormals);
        }
      
        if (materialType == ${MATERIAL_TYPE.TORRANCE_SPARROW}) {
          return sampleTSBrdf(material, ray, surfaceAttributes, surfaceNormals);
        }
      
        if (materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
          return sampleDielectricBrdf(material, ray, surfaceAttributes, surfaceNormals);
        }
      
        return BrdfDirectionSample(vec3f(0), 0, 0, vec3f(0));
      }

      fn sampleLight(
        material: EvaluatedMaterial, 
        ray: ptr<function, Ray>,
        surfaceAttributes: SurfaceAttributes,
        surfaceNormals: SurfaceNormals,
      ) -> LightDirectionSample {
        let materialType = material.materialType;
      
        if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
          return sampleDiffuseLight(material, ray, surfaceAttributes, surfaceNormals);
        }
      
        if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
          return sampleEmissiveLight(material, ray, surfaceAttributes, surfaceNormals);
        }
      
        if (materialType == ${MATERIAL_TYPE.TORRANCE_SPARROW}) {
          return sampleTSLight(material, ray, surfaceAttributes, surfaceNormals);
        }
      
        if (materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
          return sampleDielectricLight(material, ray, surfaceAttributes, surfaceNormals);
        }
      
        return LightDirectionSample(vec3f(0), 0, 0, vec3f(0), LightSample());
      }

      fn evaluateMaterialAtSurfacePoint(
        surface: SurfaceDescriptor,
        surfaceAttributes: SurfaceAttributes
      ) -> EvaluatedMaterial {
        let materialOffset = triangles[surface.triangleIndex].materialOffset;
        let materialType = u32(materialsBuffer[materialOffset]);
      
        if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
          return getDiffuseMaterial(surfaceAttributes, materialOffset);
        }
      
        if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
          return getEmissiveMaterial(materialOffset);
        }
      
        if (materialType == ${MATERIAL_TYPE.TORRANCE_SPARROW}) {
          return getTSMaterial(surfaceAttributes, materialOffset);
        }
      
        if (materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
          return getDielectricMaterial(surfaceAttributes, materialOffset);
        }
      
        // undefined material, magenta color
        var errorMat = EvaluatedMaterial();
        errorMat.baseColor = vec3f(1.0, 0.0, 1.0);
        errorMat.materialType = ${MATERIAL_TYPE.EMISSIVE};
        errorMat.emissiveIntensity = 1.0;
        errorMat.mapLocation = vec2i(-1, -1);
        errorMat.bumpMapLocation = vec2i(-1, -1);
        errorMat.roughnessMapLocation = vec2i(-1, -1);
        return errorMat;
      }

      fn getEmissive(material: EvaluatedMaterial, isBackFacing: bool) -> vec3f {
        let materialType = material.materialType;
        if (materialType == ${MATERIAL_TYPE.EMISSIVE} && !isBackFacing) {
          return material.baseColor * material.emissiveIntensity;
        }
        return vec3f(0);
      }

      fn getNormalsAtPoint(
        material: EvaluatedMaterial,
        ray: ptr<function, Ray>,
        surfaceAttributes: SurfaceAttributes,
        triangle: Triangle,
        bumpOffset: ptr<function, f32>,
        isBackfacing: ptr<function, bool>,
      ) -> SurfaceNormals {
        *isBackfacing = false;
        let materialType = material.materialType;

        let geometricNormal = triangle.geometricNormal;
        var vertexNormal = surfaceAttributes.normal;
        // the normal flip is calculated using the geometric normal to avoid
        // black edges on meshes displaying strong smooth-shading via vertex normals
        if (dot(geometricNormal, (*ray).direction) > 0) {
          *isBackfacing = true;
        
          if (materialType != ${MATERIAL_TYPE.DIELECTRIC}) {
            vertexNormal = -vertexNormal;
          }
        }
        var normals = SurfaceNormals(geometricNormal, vertexNormal, vertexNormal);
      
        if (
          materialType == ${MATERIAL_TYPE.DIFFUSE} ||
          materialType == ${MATERIAL_TYPE.TORRANCE_SPARROW} 
        ) {
          let bumpMapLocation = material.bumpMapLocation;
          let bumpStrength = material.bumpStrength;
          let uvRepeat = material.uvRepeat;
        
          if (bumpMapLocation.x > -1) {
          
            let surfAttrWithFlippedNormal = SurfaceAttributes(vertexNormal, surfaceAttributes.uv, surfaceAttributes.tangent);
            normals.shading = getShadingNormal(
              bumpMapLocation, bumpStrength, uvRepeat, surfAttrWithFlippedNormal, 
              *ray, triangle, bumpOffset
            );
          }
        }
      
        if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
          *isBackfacing = false;
        
          var N = geometricNormal;
          if (dot(N, (*ray).direction) > 0) {
            *isBackfacing = true;
            N = -N;
          }
        
          normals.geometric = N;
          normals.vertex    = N;
          normals.shading   = N;
        }
      
        return normals;
      }

      fn cosTerm(norm: vec3f, dir: vec3f, materialType: u32) -> f32 {
        if (materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
          return abs(dot(norm, dir));
        }
        return max(dot(norm, dir), 0.0);
      }
    `;
  }
}
