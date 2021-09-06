import { Vector2, Vector3 } from "three";
import { Camera } from "./camera";
import { ComputationRequest, ComputationResult, IStartMessage, IWorkerMessage } from "./commonTypes";
import { AABB } from "./geometry/aabb";
import { BVH } from "./geometry/bvh";
import { PrimitiveIntersection } from "./geometry/intersection";
import { Ray } from "./geometry/ray";
import { Material, Materials } from "./materials/materials";
import { SimpleEmission } from "./materials/simpleEmission";
import { SimpleGlossy } from "./materials/simpleGlossy";
import { SimpleLambert } from "./materials/simpleLambert";
import { SimpleMirror } from "./materials/simpleMirror";
import { SimpleTransmission } from "./materials/simpleTransmission";
import { Primitive } from "./primitives/primitive";
import { Sphere } from "./primitives/sphere";
import { Triangle } from "./primitives/triangle";
import { Tile, TileManager } from "./tile";
import { vec3 } from "./utils";

// (self as unknown as Worker) was a fix I took from: https://github.com/Microsoft/TypeScript/issues/20595
// I got the issue link from: https://stackoverflow.com/questions/48950248/how-do-i-strongly-type-a-typescript-web-worker-file-with-postmessage
const ctx: Worker = self as any;

let workerIndex : number;
let scene : any;
let camera : Camera;
let bvh : BVH;
let primitives : Primitive[] = [];
let materials : Material[] = [];
let canvasSize : Vector2;
let background : Vector3;

ctx.onmessage = ({ data }: { data: IWorkerMessage }) => {

  let tile : Tile;

  if (data.type == "scene-setup") {
    let startMessage = data as IStartMessage;
    
    workerIndex = startMessage.workerIndex;
    scene = JSON.parse(startMessage.scene);

    tile = startMessage.tile;

    canvasSize = startMessage.canvasSize;

    camera = new Camera(
      new Vector3().copy(scene.camera.center),
      new Vector3().copy(scene.camera.target),
      new Vector2().copy(startMessage.canvasSize),
      scene.camera.fov,
    );

    background = new Vector3().copy(scene.background);

    // build the entities array
    for(let i = 0; i < scene.entities.length; i++) {
      let e = scene.entities[i];
      if(e.type == "sphere") {
        let newEntity = new Sphere(
          new Vector3(e.center.x, e.center.y, e.center.z), 
          e.radius,
          e.material,
        );
        primitives.push(newEntity);
      }
      if(e.type == "triangle") {
        let newEntity = new Triangle(
          new Vector3(e.v0.x, e.v0.y, e.v0.z),
          new Vector3(e.v1.x, e.v1.y, e.v1.z),
          new Vector3(e.v2.x, e.v2.y, e.v2.z),
          e.material
        );
        primitives.push(newEntity);
      }
    }

    // debugger;
    // let t = new Triangle(vec3(-10, -10, 10), vec3(10, -10, 10), vec3(0, 10, 10), 1);
    // let ray = new Ray(vec3(0,0,9), vec3(0,0,1));
    // t.intersect(ray);

    bvh = new BVH(primitives);

    // build the materials array
    for(let i = 0; i < scene.materials.length; i++) {
      let m = scene.materials[i];
      if(m.type == Materials.SimpleLambert) {
        materials.push(
          new SimpleLambert(new Vector3(m.color.x, m.color.y, m.color.z))
        );
      }
      if(m.type == Materials.SimpleMirror) {
        materials.push(
          new SimpleMirror(new Vector3(m.color.x, m.color.y, m.color.z))
        );
      }
      if(m.type == Materials.SimpleGlossy) {
        materials.push(
          new SimpleGlossy(
            new Vector3(m.color.x, m.color.y, m.color.z),
            m.glossiness,
          )
        );
      }
      if(m.type == Materials.SimpleTransmission) {
        materials.push(
          new SimpleTransmission(
            new Vector3(m.color.x, m.color.y, m.color.z),
            m.refractionIndex,
          )
        );
      }
      if(m.type == Materials.SimpleEmission) {
        materials.push(
          new SimpleEmission(
            new Vector3(m.emission.x, m.emission.y, m.emission.z),
          )
        );
      }
    }

  } else if (data.type == "computation-request") {

    let computationRequest = data as ComputationRequest;
    tile = computationRequest.tile;

  }

  let computationResult : ComputationResult = {
    type: "computation-result",
    tile: renderTile(tile),
    workerIndex: workerIndex,
  };

  ctx.postMessage(computationResult);
};

function renderTile(tile: Tile) : Tile {
  
  // recreating tile data here to avoid having to pass megabytes each time with the first message
  TileManager.resetTileData(tile);


  for(let s = 0; s < tile.samples; s++) {
    for(let i = 0; i < tile.width; i++) {
      for(let j = 0; j < tile.height; j++) {
        let x = tile.x + i;
        let y = tile.y + j;
  
        let index = (tile.width * y + x) * 3;
  
        let ray = camera.getRay(x, y);
        let mult : Vector3 = new Vector3(1,1,1);
        let radiance = new Vector3(0,0,0);
  
        for(let b = 0; b < 6; b++) {
  
          let mint : number = Infinity;
          let closestPrimitive : Primitive; 
          let closestHitResult : PrimitiveIntersection;

          // for(let pi = 0; pi < primitives.length; pi++) {
          //   let primitive = primitives[pi];
          //   let intersectionResult = primitive.intersect(ray);
          //   if(intersectionResult.intersected) {
          //     if(intersectionResult.t < mint) {
          //       mint = intersectionResult.t;
          //       closestPrimitive = primitive;
          //       closestHitResult = intersectionResult;
          //     }
          //   }
          // }

          closestHitResult = bvh.intersect(ray);
          mint = closestHitResult.t;
          closestPrimitive = closestHitResult.primitive;

    
          if(mint < Infinity) {
            let material = materials[closestPrimitive.materialIndex];
            let emission = material.getEmission(closestHitResult, ray);
            radiance.add(
              emission.clone().multiply(mult)
            );

            material.scatter(closestHitResult, ray, mult);
          } else {

            radiance.add(background);
           
            break;
          }
        }
  
        radiance.multiply(mult);
  
        tile.data[index + 0] += radiance.x;
        tile.data[index + 1] += radiance.y;
        tile.data[index + 2] += radiance.z;
      }
    }
  }

  return tile;
}