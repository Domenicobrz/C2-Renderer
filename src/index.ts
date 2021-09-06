/**
 
When installing third party libraries from npm, it is important to remember to install the typing definition for that library. These definitions can be found at TypeSearch.

For example if we want to install lodash we can run the following command to get the typings for it:

npm install --save-dev @types/lodash
For more information see this blog post.
 
*/

import { FloatType, Vector2, Vector3 } from "three";
import { ComputationRequest, ComputationResult, IStartMessage, IWorkerMessage } from "./commonTypes";
import { createScene } from "./createScene";
import { refreshDisplay } from "./display";
import { Tile, TileManager } from "./tile";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader";

let canvasSize = new Vector2(800, 550);
// canvasSize = new Vector2(600, 400);

let canvas    = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width  = canvasSize.x;
canvas.height = canvasSize.y;

let context = canvas.getContext('2d');
let imageDataObject = context.createImageData(canvasSize.x, canvasSize.y);

let radianceData = new Float32Array(canvasSize.x * canvasSize.y * 3);
for(let i = 0; i < radianceData.length; i++) {
  radianceData[0] = 0;
}

let workersCount = 6;
let workers : Worker[] = [];
let samplesCount = 0;
let tileSamples = 1;


// let envmap = new RGBELoader().setDataType( FloatType ).load('assets/envmaps/studio_loft.hdr', (t) => {
//   console.log(t);
// });


function start() {
  // can't be created inside the for-loop otherwise random() based scenes would be different 
  // for each webworker
  let scene = createScene();

  for(let i = 0; i < workersCount; i++) {
    const worker = new Worker(new URL('./tracer', import.meta.url));
  
    workers.push(worker);
  
    workers[i].postMessage({
      type: "scene-setup",
      tile: new Tile(0, 0, canvasSize.x, canvasSize.y, tileSamples, null),
      canvasSize: canvasSize,
      workerIndex: i,
      scene,
    } as IStartMessage);
    
    workers[i].onmessage = onWorkerMessage;
  }
}

function onWorkerMessage({ data } : { data: IWorkerMessage }) {
  if(data.type == "computation-result") {
    let computationResult = data as ComputationResult;

    let workerIndex = computationResult.workerIndex;
    let tile        = computationResult.tile;

    TileManager.addSample(radianceData, canvasSize, tile);

    samplesCount += tileSamples;
    console.log(samplesCount + "  from worker: " + workerIndex);

    if((samplesCount / tileSamples) % workersCount == 0) {
      console.log("also refreshing display");
      refreshDisplay(context, imageDataObject, canvasSize, radianceData, samplesCount);
    }

    // assign new block to worker and let it run again
    let computationRequest = new ComputationRequest(tile);
    if(!stopRequested) {
      workers[workerIndex].postMessage(computationRequest);
    }
  }
};


let stopRequested = false;
document.querySelector("#stop-btn").addEventListener("click", () => {
  stopRequested = true;
});

document.querySelector("#start-btn").addEventListener("click", () => {
  stopRequested = false;
  start();
});