import { AABB } from '$lib/bvh/aabb';
import { PC2D } from '$lib/samplers/PiecewiseConstant2D';
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
    let radianceData = [];
    let luminanceData: number[][] = [];
    let thresholdedLuminanceData: number[][] = [];
    let luminanceAverage = 0;

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

        // in teoria, dovremmo fare anche tutta quella cosa sull'interpolazione etc.
        let dir = this.equalAreaSquareToSphere(new Vector2(u, v));
        dir.normalize();

        // this is the original algorithm to convert from cartesian to polar,
        // let euv = new Vector2(Math.atan2(dir.z, dir.x), Math.asin(dir.y));
        // however I think pbrt considers z to be going up, so
        // I replaced the z with y
        let euv = new Vector2(Math.atan2(dir.y, dir.x), Math.asin(dir.z));
        euv.multiply(new Vector2(1 / (Math.PI * 2), 1 / Math.PI));
        euv.addScalar(0.5);

        // I think this is necessary because the equirect image is stored in memory
        // in such an order that requires a final negation of the y value
        euv.y = 1 - euv.y;

        let startIndex =
          Math.floor(euv.x * equirectSize.x) + Math.floor(euv.y * equirectSize.y) * equirectSize.x;

        let r = equirectData[startIndex * 4 + 0];
        let g = equirectData[startIndex * 4 + 1];
        let b = equirectData[startIndex * 4 + 2];

        radianceData.push(r, g, b, 1);

        // https://stackoverflow.com/a/56678483/7379920
        // step 3 from the question, we care about real luminance and not perceived luminance
        // the rgb values provided are already linearized
        let luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        luminanceAverage += luminance;

        if (j === 0) luminanceData.push([]);
        luminanceData[i].push(luminance);
      }
    }
    luminanceAverage /= envmapSize * envmapSize;

    // TODO: ALSO CREATE THRESHOLDED LUMINANCE DATA
    for (let i = 0; i < envmapSize; i++) {
      for (let j = 0; j < envmapSize; j++) {
        if (j === 0) thresholdedLuminanceData.push([]);
        thresholdedLuminanceData[i].push(Math.max(luminanceData[i][j] - luminanceAverage, 0));
      }
    }

    // create pc2d and sample it a few times just to test it
    let distribution = new PC2D(
      luminanceData,
      envmapSize,
      envmapSize,
      new AABB(new Vector3(0, 0, 0), new Vector3(1, 1, 0))
    );
    let compensatedDistribution = new PC2D(
      thresholdedLuminanceData,
      envmapSize,
      envmapSize,
      new AABB(new Vector3(0, 0, 0), new Vector3(1, 1, 0))
    );
    for (let i = 0; i < 300; i++) {
      let res = distribution.samplePC2D(new Vector2(Math.random(), Math.random()));
      // console.log(res.pdf, res.offset, res.floatOffset, luminanceData[res.offset.y][res.offset.x]);

      // mark as red sampled pixels
      let startIndex = res.offset.x + res.offset.y * envmapSize;
      radianceData[startIndex * 4 + 0] = 1;
      radianceData[startIndex * 4 + 1] = 0;
      radianceData[startIndex * 4 + 2] = 0;
    }

    this.#data = new Float32Array(radianceData);
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
