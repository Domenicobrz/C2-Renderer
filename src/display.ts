import { Vector2, Vector3 } from "three";

export function refreshDisplay(
  context : CanvasRenderingContext2D, 
  imageDataObject : ImageData, 
  canvasSize : Vector2, 
  radianceData : Float32Array,
  samplesCount : number) : void {

  let imageData = imageDataObject.data;

  let mappedColor = new Vector3();
  let gamma       = 2.2;
  let exposure    = 1;
  let toneMapping = true;

  for (var i = 0; i < canvasSize.x * canvasSize.y * 4; i += 4) {
    let pixelIndex = Math.floor(i / 4);
    let y = canvasSize.y - 1 - Math.floor(pixelIndex / canvasSize.x);
    let x = pixelIndex % canvasSize.x;

    let index = (y * canvasSize.x + x) * 3;

    let r = radianceData[index + 0] / (samplesCount);
    let g = radianceData[index + 1] / (samplesCount);
    let b = radianceData[index + 2] / (samplesCount);

    // Exposure tone mapping
    // from: https://learnopengl.com/Advanced-Lighting/HDR
    if(toneMapping) {
      mappedColor.setX(1 - Math.exp(-r * exposure));
      mappedColor.setY(1 - Math.exp(-g * exposure));
      mappedColor.setZ(1 - Math.exp(-b * exposure));

      mappedColor.setX(Math.pow(mappedColor.x, 1 / gamma));
      mappedColor.setY(Math.pow(mappedColor.y, 1 / gamma));
      mappedColor.setZ(Math.pow(mappedColor.z, 1 / gamma));

      r = mappedColor.x * 255;
      g = mappedColor.y * 255;
      b = mappedColor.z * 255;
    } else {
      r *= 255;
      g *= 255;
      b *= 255;
    }

    if(r > 255) r = 255;
    if(g > 255) g = 255;
    if(b > 255) b = 255;

    imageData[i + 0] = r;
    imageData[i + 1] = g;
    imageData[i + 2] = b;
    imageData[i + 3] = 255;
  }

  context.putImageData(imageDataObject, 0, 0);
}