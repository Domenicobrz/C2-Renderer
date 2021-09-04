import { Vector3 } from "three";
import { Materials } from "./materials/materials";
import { nrand, rand } from "./utils";

export function createScene(): string {
  let entities = [];
  let materials = [
    {
      idx: 0,
      type: Materials.SimpleLambert,
      color: new Vector3(0.9, 0.9, 0.9),
    },
    {
      idx: 1,
      type: Materials.SimpleLambert,
      color: new Vector3(1, 0.5, 0.24),
    },
    {
      idx: 2,
      type: Materials.SimpleMirror,
      color: new Vector3(0.24, 0.5, 1.0),
    },
    {
      idx: 3,
      type: Materials.SimpleLambert,
      color: new Vector3(0.8, 0.15, 0.05),
    },
    {
      idx: 4,
      type: Materials.SimpleTransmission,
      color: new Vector3(0.85, 0.85, 0.85),
      refractionIndex: 1.5,
    },
  ];

  for (let i = 0; i < 3000; i++) {
    entities.push({
      type: "sphere",
      radius: Math.random() * 2 + 0.2,
      material: Math.floor(rand() * 4.99),
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
//     
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