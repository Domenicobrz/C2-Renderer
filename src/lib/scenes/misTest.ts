import { Color, Vector3 } from 'three';
import { Diffuse } from './../materials/diffuse';
import { Emissive } from './../materials/emissive';
import type { Material } from './../materials/material';
import { Triangle } from './../primitives/triangle';

export function misTestScene(): { triangles: Triangle[]; materials: Material[] } {
  /*
  
    as of 6/3/2024 this test returns different results depending on which method is being used
    on top of that, in this scene NEE seems to gather *less* energy than OSM and BRDF_ONLY, 
    but on a scene that is "contained" like a cornell box, NEE seems to gather *more* energy
    than both OSM and BRDF_ONLY 

    OSM and BRDF_ONLY seem to agree on this particular test
  
  */

  let triangles: Triangle[] = [];
  let materials: Material[] = [
    new Diffuse(new Color(0.95, 0.95, 0.95)),
    new Emissive(new Color(1, 0.7, 0.5), 40)
  ];

  const lightSize = 0.75;
  const lightPosition = new Vector3(0, 0, 0);
  triangles.push(
    new Triangle(
      new Vector3(-1, 0, 0).multiplyScalar(lightSize).add(lightPosition),
      new Vector3(+1, +2, 0).multiplyScalar(lightSize).add(lightPosition),
      new Vector3(+1, 0, 0).multiplyScalar(lightSize).add(lightPosition),
      1
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(+1, +2, 0).multiplyScalar(lightSize).add(lightPosition),
      new Vector3(-1, 0, 0).multiplyScalar(lightSize).add(lightPosition),
      new Vector3(-1, +2, 0).multiplyScalar(lightSize).add(lightPosition),
      1
    )
  );

  const groundSize = 10;
  triangles.push(
    new Triangle(
      new Vector3(+1, 0, -1).multiplyScalar(groundSize),
      new Vector3(-1, 0, -1).multiplyScalar(groundSize),
      new Vector3(-1, 0, +1).multiplyScalar(groundSize),
      0
    )
  );
  triangles.push(
    new Triangle(
      new Vector3(+1, 0, -1).multiplyScalar(groundSize),
      new Vector3(-1, 0, +1).multiplyScalar(groundSize),
      new Vector3(+1, 0, +1).multiplyScalar(groundSize),
      0
    )
  );

  return { triangles, materials };
}
