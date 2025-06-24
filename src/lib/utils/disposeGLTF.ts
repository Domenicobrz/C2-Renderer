export function disposeGltf(gltf: any) {
  if (!gltf) return;

  gltf.scene.traverse((object: any) => {
    if (object.isMesh) {
      if (object.geometry) {
        object.geometry.dispose();
      }

      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((material: any) => disposeMaterial(material));
        } else {
          disposeMaterial(object.material);
        }
      }
    }
  });

  if (gltf.scene.parent) {
    gltf.scene.parent.remove(gltf.scene);
  }
}

function disposeMaterial(material: any) {
  material.dispose();

  for (const key of Object.keys(material)) {
    const value = material[key];
    if (value && typeof value === 'object' && value.isTexture) {
      value.dispose();
    }
  }
}
