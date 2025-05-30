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
        ior: f32,
        eta: f32,

        bumpStrength: f32,

        uvRepeat: vec2f,
        mapUvRepeat: vec2f,

        mapLocation: vec2i,
        bumpMapLocation: vec2i,
        roughnessMapLocation: vec2i,
      } 
    `;
  }

  static shaderCreateStruct(): string {
    return '';
  }

  static shaderShade() {
    return /* wgsl */ `
      fn shade(
        ires: BVHIntersectionResult, 
        ray: ptr<function, Ray>,
        reflectance: ptr<function, vec3f>, 
        lastBrdfMisWeight: ptr<function, f32>, 
        rad: ptr<function, vec3f>,
        tid: vec3u,
        i: i32) 
      {
        let materialOffset = ires.triangle.materialOffset;
        let materialType = materialsBuffer[materialOffset];

        if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
          shadeDiffuse(ires, ray, reflectance, lastBrdfMisWeight, rad, tid, i);
        }

        if (materialType == ${MATERIAL_TYPE.EON_DIFFUSE}) {
          shadeEONDiffuse(ires, ray, reflectance, lastBrdfMisWeight, rad, tid, i);
        }

        if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
          shadeEmissive(ires, ray, reflectance, lastBrdfMisWeight, rad, tid, i);
        }

        if (materialType == ${MATERIAL_TYPE.TORRANCE_SPARROW}) {
          shadeTorranceSparrow(ires, ray, reflectance, lastBrdfMisWeight, rad, tid, i);
        }

        if (materialType == ${MATERIAL_TYPE.DIELECTRIC}) {
          shadeDielectric(ires, ray, reflectance, lastBrdfMisWeight, rad, tid, i);
        }
      }
    `;
  }
}
