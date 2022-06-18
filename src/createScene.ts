import { Vector2, Vector3 } from "three";
import { Materials } from "./materials/materials";
import { nrand, rand, vec3 } from "./utils";

/*
  let materials = [
    new LambertMaterialDef({ color }) // internally sets an index somehow
                                      // static #count variable inside class Material{...} ?
  ] : MaterialDef;
 
  let entities = [
    new SphereEntityDef({
      center, radius, material: materials[0].getIndex()
    }) // internally sets type
  ] : EntityDef;
 
  - - - - - - - - - 

  let materials = [
    { type, index, color } // inferred as MaterialDef
  ] : MaterialDef;
 
  let entities = [
    // inferred as EntityDef
    { type: "sphere", radius, center, material: materials[0].index } 
  ] : EntityDef;
 
  - - - - - - - - - 

  let entities = [
    // returns EntityDef ?
    new Sphere({ center, radius, material }).serialize()
  ] : EntityDef;

  - - - - - - - - -

  ******* this is promising *******
  ******* this is promising *******
  ******* this is promising *******

  let entities = [
    new Sphere({ center, radius, material })
  ] : Primitive;

  // ... later, inside index.ts ...
  scene.serialize(); // calls the serialize() method of all the primitives/materials etc.
  * things like .background might be impossible to serialize, in that case we duplicate the class
    e.g. class BackgroundDef {...}
  * the "scene" object that arrives in tracer.ts would be "serialized", and we would have static methods
    from each class to "deserialize" the object into a real instance

  - - - - - - - - -

  * I would prefer a unified way of building primitives, as in, always calling Sphere()
  * that way it's also easier for developers to create scenes (they could also leverage threejs though..)
  * what if we assume scenes are built mainly in threejs and then "parsed"? 
    we would lose e.g. the sphere primitive
  * how much can we really leverage threejs to cover some of these requirements?

*/


export function createScene(): string {
  let entities  = [];
  let materials = [
    {
      idx: 0,
      type: Materials.SimpleMirror,
      color: new Vector3(1, 1, 1),
    },
  ];

  entities.push({
    type: "sphere",
    radius: 2,
    material: 0,
    center: new Vector3(0, 0, 5),
  });
  

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



// export function createScene(): string {
//   let entities  = [];
//   let materials = [
//     {
//       idx: 0,
//       type: Materials.SimpleLambert,
//       color: new Vector3(0.9, 0.9, 0.9),
//     },
//     {
//       idx: 1,
//       type: Materials.SimpleLambert,
//       color: new Vector3(1, 0.5, 0.24),
//     },
//     {
//       idx: 2,
//       type: Materials.SimpleMirror,
//       color: new Vector3(0.24, 0.5, 1.0),
//     },
//     {
//       idx: 3,
//       type: Materials.SimpleLambert,
//       color: new Vector3(0.8, 0.15, 0.05),
//     },
//     {
//       idx: 4,
//       type: Materials.SimpleTransmission,
//       color: new Vector3(0.85, 0.85, 0.85),
//       refractionIndex: 1.5,
//     },
//     {
//       idx: 5,
//       type: Materials.SimpleEmission,
//       emission: new Vector3(90,8,8).multiplyScalar(50),
//     },
//     {
//       idx: 6,
//       type: Materials.SimpleEmission,
//       emission: new Vector3(15,70,15).multiplyScalar(10),
//     },
//   ];

//   for (let i = 0; i < 450; i++) {
//     let center = new Vector3(nrand(30), nrand(30), nrand(60) + 40)
//     if(center.length() < 35) continue;

//     entities.push({
//       type: "sphere",
//       radius: Math.random() * 4 + 2,
//       material: Math.floor(rand() * 3.99),
//       center,
//     });
//   }

//   return JSON.stringify({
//     entities,
//     materials,
//     camera: {
//       center: new Vector3(0, 0, 0),
//       target: new Vector3(0, 0, 1),
//       fov: (25 / 180) * Math.PI,
//     },
//     // background: new Vector3(3, 3, 3)
//     background: {
//       path: "assets/envmaps/studio_loft.hdr",
//       intensity: vec3(3.4, 3.4, 3.4),
//     },
//   });
// }