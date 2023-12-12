import type { Color } from 'three';
import { Material } from './Material';

export class Diffuse extends Material {
  private color: Color;

  constructor(color: Color) {
    super();
    this.type = 0;
    this.color = color;
  }

  getFloatsArray(): number[] {
    return [this.type, this.color.r, this.color.g, this.color.b];
  }

  static shaderStruct(): string {
    return /* wgsl */ `
      struct Diffuse {
        color: vec3f
      }
    `;
  }

  static shaderCreateStruct(): string {
    return /* wgsl */ `
      fn createDiffuse(offset: u32) -> Diffuse {
        var diffuse: Diffuse;
        diffuse.color = vec3f(
          materialsData[offset + 1],
          materialsData[offset + 2],
          materialsData[offset + 3],
        );
        return diffuse;
      } 
    `;
  }
}
