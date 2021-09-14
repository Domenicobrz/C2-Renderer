import { DataTexture, FloatType, Vector3 } from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader";
import { Ray } from "./geometry/ray";

export class HDRBackground {
  private texture : DataTexture;
  private image : ImageData;
  private imageWidth  : number;
  private imageHeight : number;

  constructor(public intensity: Vector3) { }

  load(path: string): Promise<void> {
    return new Promise((res, rej) => {
      new RGBELoader().setDataType( FloatType ).load(path, (t) => {
        this.texture = t;
        this.image = t.image;
        this.imageWidth  = this.image.width;
        this.imageHeight = this.image.height;

        res();
      });
    });
  }

  getRadiance(ray : Ray) : Vector3 {
    let dir = ray.direction;
    let v = (Math.asin(dir.y) + Math.PI * 0.5) / Math.PI;
    let u = (Math.atan2(dir.x, dir.z) + Math.PI) / (Math.PI * 2);

    let ix = Math.floor(u * this.imageWidth);
    let iy = Math.floor(v * this.imageHeight);
    let i = (iy * this.imageWidth + ix) * 3;

    let r = this.image.data[i + 0];
    let g = this.image.data[i + 1];
    let b = this.image.data[i + 2];

    return new Vector3(r,g,b).multiply(this.intensity);
  }
}