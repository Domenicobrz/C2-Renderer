import { copySign } from '$lib/utils/math';
import { FloatType, Vector2, Vector3 } from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';

export class Envmap {
  #data: Float32Array = new Float32Array();
  #size: Vector2 = new Vector2(0, 0);

  constructor() {}

  async fromEquirect(path: string) {
    // texture data has 4 float elements for each pixel (rgba)
    // the fourth element of each pixel returned by this loader is always 1
    let hdrTexture = await new RGBELoader().setDataType(FloatType).loadAsync(path);

    // this.#data = hdrTexture.source.data.data;
    // this.#size = new Vector2(hdrTexture.source.data.width, hdrTexture.source.data.height);

    let equirectData = hdrTexture.source.data.data;
    let equirectSize = new Vector2(hdrTexture.source.data.width, hdrTexture.source.data.height);
    let data = [];

    // I primi pixel sono in alto! gli ultimi sono in basso
    // ora facciamo un'altra cosa, cercheremo di creare la texture
    // con quel tipo di envmap. Per prima cosa, dobbiamo iterare su
    // size x x size y della envmap texture, e per ognuno di quei pixel,
    // cercheremo la 3d direction corrispondente, e prenderemo il pixel della hdr texture sopra
    let envmapSize = 600;
    for (let i = 0; i < envmapSize; i++) {
      for (let j = 0; j < envmapSize; j++) {
        let hstep = 1 / (envmapSize * 2);
        let u = j / envmapSize + hstep;
        let v = i / envmapSize + hstep;

        // usando EqualAreaSquareToSphere
        // trasformiamo uv in direction xyz e prendiamo il pixel di hdrTexture
        // corrispondente a quella direzione.
        // in teoria, dovremmo fare anche tutta quella cosa sull'interpolazione etc.
        let dir = this.equalAreaSquareToSphere(new Vector2(u, v));
        dir.normalize();

        // this is the version in the book, however I think they consider z to be going up, so
        // I replaced the z with y, and also had to negate the z to get the same result, not sure why
        // let euv = new Vector2(Math.atan2(dir.z, dir.x), Math.asin(dir.y));
        let euv = new Vector2(Math.atan2(dir.y, dir.x), Math.asin(-dir.z));
        euv.multiply(new Vector2(1 / (Math.PI * 2), 1 / Math.PI));
        euv.addScalar(0.5);

        let startIndex =
          Math.floor(euv.x * equirectSize.x) + Math.floor(euv.y * equirectSize.y) * equirectSize.x;

        data.push(
          equirectData[startIndex * 4 + 0],
          equirectData[startIndex * 4 + 1],
          equirectData[startIndex * 4 + 2],
          1
        );
      }
    }

    this.#data = new Float32Array(data);
    this.#size = new Vector2(envmapSize, envmapSize);
  }

  equalAreaSquareToSphere(p: Vector2): Vector3 {
    let u = 2 * p.x - 1;
    let v = 2 * p.y - 1;
    let up = Math.abs(u);
    let vp = Math.abs(v);
    let signedDistance = 1 - (up + vp);
    let d = Math.abs(signedDistance);
    let r = 1 - d;
    let phi = ((r == 0 ? 1 : (vp - up) / r + 1) * Math.PI) / 4;
    let z = copySign(1 - r * r, signedDistance);
    let cosPhi = copySign(Math.cos(phi), u);
    let sinPhi = copySign(Math.sin(phi), v);

    return new Vector3(cosPhi * r * Math.sqrt(2 - r * r), sinPhi * r * Math.sqrt(2 - r * r), z);
  }

  getData(): { data: Float32Array; size: Vector2 } {
    return { data: this.#data, size: this.#size };
  }
}
