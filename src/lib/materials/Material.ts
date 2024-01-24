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

  static shaderMaterialSelection(): string {
    return /* wgsl */ `
      fn getAlbedo(offset: u32) -> vec3f {
        let materialType = u32(materialsData[offset]);

        if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
          let diffuse = createDiffuse(offset);
          return diffuse.color;
        }

        if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
          return vec3f(1,1,1);
        }

        return vec3f(0,0,0);
      }

      fn getEmissive(offset: u32) -> vec3f {
        let materialType = u32(materialsData[offset]);

        if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
          let emissive = createEmissive(offset);
          return emissive.color * emissive.intensity;
        }

        return vec3f(0,0,0);
      }
    `;
  }

  static shaderShade() {
    return /* wgsl */ `
      fn shade(
        ires: BVHIntersectionResult, 
        ray: ptr<function, Ray>,
        mult: ptr<function, vec3f>, 
        rad: ptr<function, vec3f>,
        gid: vec3u,
        i: i32) 
      {
        let materialOffset = ires.triangle.materialOffset;
        let materialType = materialsData[materialOffset];

        if (materialType == ${MATERIAL_TYPE.DIFFUSE}) {
          shadeDiffuse(ires, ray, mult, rad, gid, i);
        }

        if (materialType == ${MATERIAL_TYPE.EMISSIVE}) {
          shadeEmissive(ires, ray, mult, rad, gid, i);
        }
      }
    `;
  }
}
