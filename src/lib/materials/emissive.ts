import type { Color } from 'three';
import { MATERIAL_TYPE, Material } from './material';

export class Emissive extends Material {
  private color: Color;
  private intensity: number;

  constructor(color: Color, intensity: number = 1) {
    super();
    this.type = MATERIAL_TYPE.EMISSIVE;
    this.color = color;
    this.intensity = intensity;
    this.bytesCount = 5;
  }

  getFloatsArray(): number[] {
    return [this.type, this.color.r, this.color.g, this.color.b, this.intensity];
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct Emissive {
        color: vec3f,
        intensity: f32,
      }
    `;
  }

  static shaderCreateStruct(): string {
    return /* wgsl */ `
      fn createEmissive(offset: u32) -> Emissive {
        var emissive: Emissive;
        emissive.color = vec3f(
          materialsData[offset + 1],
          materialsData[offset + 2],
          materialsData[offset + 3],
        );
        emissive.intensity = materialsData[offset + 4];

        return emissive;
      } 
    `;
  }
}
