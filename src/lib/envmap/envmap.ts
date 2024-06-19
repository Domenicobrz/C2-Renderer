import { FloatType, Vector2 } from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';

export class Envmap {
  #data: Float32Array = new Float32Array();
  #size: Vector2 = new Vector2(0, 0);

  constructor() {}

  async fromEquirect(path: string) {
    let hdrTexture = await new RGBELoader().setDataType(FloatType).loadAsync(path);

    this.#data = hdrTexture.source.data.data;
    this.#size = new Vector2(hdrTexture.source.data.width, hdrTexture.source.data.height);

    // I primi pixel sono in alto! gli ultimi sono in basso
    // ora facciamo un'altra cosa, cercheremo di creare la texture
    // con quel tipo di envmap. Per prima cosa, dobbiamo iterare su
    // size x x size y della envmap texture, e per ognuno di quei pixel,
    // cercheremo la 3d direction corrispondente, e prenderemo il pixel della hdr texture sopra
    let envmapSize = 100;
    for (let i = 0; i < envmapSize; i++) {
      for (let j = 0; j < envmapSize; j++) {
        let hstep = 1 / (envmapSize * 2);
        let u = j / envmapSize + hstep;
        let v = i / envmapSize + hstep;

        // usando EqualAreaSquareToSphere
        // trasformiamo uv in direction xyz e prendiamo il pixel di hdrTexture
        // corrispondente a quella direzione.
        // in teoria, dovremmo fare anche tutta quella cosa sull'interpolazione etc.
      }
    }
  }

  getData(): { data: Float32Array; size: Vector2 } {
    return { data: this.#data, size: this.#size };
  }
}
