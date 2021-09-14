import { Vector2, Vector3 } from "three";
import { Materials } from "./materials/materials";
import { nrand, rand, vec3 } from "./utils";



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
    {
      idx: 5,
      type: Materials.SimpleEmission,
      emission: new Vector3(90,8,8).multiplyScalar(50),
    },
    {
      idx: 6,
      type: Materials.SimpleEmission,
      emission: new Vector3(15,70,15).multiplyScalar(10),
    },
  ];

  for (let i = 0; i < 450; i++) {
    let center = new Vector3(nrand(30), nrand(30), nrand(60) + 40)
    if(center.length() < 35) continue;

    entities.push({
      type: "sphere",
      radius: Math.random() * 4 + 2,
      material: Math.floor(rand() * 3.99),
      center,
    });
  }

  return JSON.stringify({
    entities,
    materials,
    camera: {
      center: new Vector3(0, 0, 0),
      target: new Vector3(0, 0, 1),
      fov: (25 / 180) * Math.PI,
    },
    // background: new Vector3(3, 3, 3)
    background: {
      path: "assets/envmaps/studio_loft.hdr",
      intensity: vec3(3.4, 3.4, 3.4),
    },
  });
}