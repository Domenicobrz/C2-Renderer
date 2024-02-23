export const MATERIAL_TYPE = {
  DIFFUSE: 0,
  EMISSIVE: 1,
  GGX: 2
};

export class Material {
  public bytesCount: number;

  protected type: number;

  constructor() {
    this.type = -1;
    this.bytesCount = 0;
  }

  getFloatsArray(): number[] {
    return [this.type];
  }

  static shaderStruct(): string {
    return '';
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
        rad: ptr<function, vec3f>,
        tid: vec3u,
        i: i32) 
      {
        let materialOffset = ires.triangle.materialOffset;
        let materialType = materialsData[materialOffset];

        if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
          shadeDiffuse(ires, ray, reflectance, rad, tid, i);
        }

        if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
          shadeEmissive(ires, ray, reflectance, rad, tid, i);
        }

        if (materialType == ${MATERIAL_TYPE.GGX}) {
          shadeGGX(ires, ray, reflectance, rad, tid, i);
        }
      }
    `;
  }
}
