import { Vector3 } from "three";
import { Materials } from "./materials/materials";
import { nrand } from "./utils";

export function createScene(): string {
  let entities = [];
  let materials = [
    {
      idx: 0,
      type: Materials.SimpleLambert,
      color: new Vector3(0.9, 0.9, 0.9),
    }
  ];

  for (let i = 0; i < 3000; i++) {
    entities.push({
      type: "sphere",
      radius: Math.random() * 2 + 0.2,
      material: 0,
      center: new Vector3(nrand(20), nrand(20), nrand(20) + 40)
    })
  }

  return JSON.stringify({
    entities,
    materials,
    camera: {
      center: new Vector3(0, 0, 0),
      target: new Vector3(0, 0, 1),
      fov: (25 / 180) * Math.PI,
    },
  });
}

// export function createScene() : string {
//   return JSON.stringify({ 
//     entities: [
//       {
//         type: "sphere",
//         radius: 1,
//         center: new Vector3(0, -0.5, 10),
//         material: 2,
//       },
//       {
//         type: "sphere",
//         radius: 1.6,
//         center: new Vector3(-2.75, -0.5, 10),
//         material: 5,
//       },
//       {
//         type: "sphere",
//         radius: 2.5,
//         center: new Vector3(+4, 1.5,10),
//         material: 1,
//       },
//       {
//         type: "sphere",
//         radius: 0.75,
//         center: new Vector3(-2.3, 1.5, 7),
//         material: 7,
//       },
//       {
//         type: "sphere",
//         radius: 1.2,
//         center: new Vector3(-2, 2.5, 15),
//         material: 3,
//       },
//       // {
//       //   type: "sphere",
//       //   radius: 100,
//       //   center: new Vector3(0, -102.5,10),
//       //   material: 1,
//       // }, 
//       // {
//       //   type: "sphere",
//       //   radius: 150,
//       //   center: new Vector3(0, 9, 170),
//       //   material: 0,
//       // },
//     ],
//     materials: [
//       {
//         idx: 0,
//         type: Materials.SimpleLambert,
//         color: new Vector3(0.7,0.7,0.7),
//       },
//       {
//         idx: 1,
//         type: Materials.SimpleLambert,
//         color: new Vector3(1, 0.5, 0.24),
//       },
//       {
//         idx: 2,
//         type: Materials.SimpleMirror,
//         color: new Vector3(0.24, 0.5, 1.0),
//       },
//       {
//         idx: 3,
//         type: Materials.SimpleLambert,
//         color: new Vector3(0.8, 0.15, 0.05),
//       },
//       {
//         idx: 4,
//         type: Materials.SimpleGlossy,
//         color: new Vector3(1,1,1),
//         glossiness: 0.15,
//       },
//       {
//         idx: 5,
//         type: Materials.SimpleLambert,
//         color: new Vector3(1,1,1),
//       },
//       {
//         idx: 6,
//         type: Materials.SimpleMirror,
//         color: new Vector3(0.4,0.4,0.4),
//       },
//       {
//         idx: 7,
//         type: Materials.SimpleTransmission,
//         color: new Vector3(0.85, 0.85, 0.85),
//         refractionIndex: 1.5,
//       },
//     ],
//     camera: {
//       center: new Vector3(0,0,0),
//       target: new Vector3(0,0,1),
//       fov: (25 / 180) * Math.PI,
//     },
//   });
// }