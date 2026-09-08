import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Only combine opaque siblings. Moving pivots and transparent sorting stay intact.
export function batchStaticMeshes(root: THREE.Object3D): void {
  root.traverse((parent) => {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh) || child instanceof THREE.SkinnedMesh) continue;
      if (child.children.length || Array.isArray(child.material) || child.material.transparent) continue;
      if (/wheel|steering|cluster|cabin_glass|socket|cam_|interior_light/i.test(child.name)) continue;
      if (Object.keys(child.geometry.morphAttributes).length) continue;
      const batch = batches.get(child.material) ?? [];
      batch.push(child);
      batches.set(child.material, batch);
    }
    for (const [material, meshes] of batches) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map((mesh) => {
        mesh.updateMatrix();
        return mesh.geometry.clone().applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(geometries);
      for (const temporary of geometries) temporary.dispose();
      if (!geometry) continue;
      const merged = new THREE.Mesh(geometry, material);
      merged.name = `batch_${material.name}`;
      parent.remove(...meshes);
      parent.add(merged);
    }
  });
}
