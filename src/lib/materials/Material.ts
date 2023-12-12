export class Material {
  protected type: number;

  constructor() {
    this.type = -1;
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

        if (materialType == 0) {
          let diffuse = createDiffuse(offset);
          return diffuse.color;
        }

        return vec3f(0,0,0);
      }
    `;
  }
}
