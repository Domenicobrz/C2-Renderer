import type { Color } from 'three';
import { MATERIAL_TYPE, Material } from './material';

export class GGX extends Material {
  private color: Color;
  private roughness: number;

  constructor(color: Color, roughness: number) {
    super();
    this.type = MATERIAL_TYPE.GGX;
    this.color = color;
    this.roughness = roughness;
    this.bytesCount = 5;
  }

  getFloatsArray(): number[] {
    return [this.type, this.color.r, this.color.g, this.color.b, this.roughness];
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct GGX {
        color: vec3f,
        roughness: f32,
      }
    `;
  }

  static shaderCreateStruct(): string {
    return /* wgsl */ `
      fn createGGX(offset: u32) -> GGX {
        var ggx: GGX;
        ggx.color = vec3f(
          materialsData[offset + 1],
          materialsData[offset + 2],
          materialsData[offset + 3],
        );
        ggx.roughness = materialsData[offset + 4];
        return ggx;
      } 
    `;
  }
}
