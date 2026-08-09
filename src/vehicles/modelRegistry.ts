import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VehicleId } from '../core/types';

const VEHICLE_IDS: VehicleId[] = ['kaze', 'michi', 'raiden', 'shogun'];

const halfExtents: Record<VehicleId, THREE.Vector3> = {
  kaze: new THREE.Vector3(0.91, 0.42, 2.04),
  michi: new THREE.Vector3(0.93, 0.42, 1.97),
  raiden: new THREE.Vector3(0.92, 0.42, 2.23),
  shogun: new THREE.Vector3(0.98, 0.42, 2.14)
};

const templates = new Map<VehicleId, THREE.Group>();
let preloadPromise: Promise<void> | null = null;

function modelUrl(id: VehicleId): string {
  const base = import.meta.env.BASE_URL || './';
  return `${base}models/${id}.glb`;
}

function cloneMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => material.clone());
    } else if (child.material) {
      child.material = child.material.clone();
    }
  });
}

function collectBodyMaterials(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const paints: THREE.MeshStandardMaterial[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial && material.name === 'BodyPaint') {
        paints.push(material);
      }
    }
  });
  if (paints.length > 0) return paints;

  // Fallback: first standard material on a body-named mesh
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || paints.length > 0) return;
    if (!/body/i.test(child.name)) return;
    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.name = 'BodyPaint';
      paints.push(material);
    }
  });
  if (paints.length > 0) return paints;

  const fallback = new THREE.MeshStandardMaterial({ color: '#c92832', roughness: 0.28, metalness: 0.55 });
  fallback.name = 'BodyPaint';
  return [fallback];
}

function collectWheels(root: THREE.Object3D): THREE.Group[] {
  const names = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'] as const;
  const wheels: THREE.Group[] = [];
  for (const name of names) {
    const node = root.getObjectByName(name);
    if (!node) throw new Error(`Vehicle model is missing wheel pivot "${name}".`);
    // Ensure Group for rotation pivots
    if (node instanceof THREE.Group) {
      wheels.push(node);
    } else {
      const pivot = new THREE.Group();
      pivot.name = name;
      pivot.position.copy(node.position);
      pivot.quaternion.copy(node.quaternion);
      pivot.scale.copy(node.scale);
      const parent = node.parent;
      if (parent) {
        parent.add(pivot);
        parent.remove(node);
      }
      node.position.set(0, 0, 0);
      node.rotation.set(0, 0, 0);
      node.scale.set(1, 1, 1);
      pivot.add(node);
      wheels.push(pivot);
    }
  }
  return wheels;
}

function collectBrakeLights(root: THREE.Object3D): THREE.Mesh[] {
  const lights: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const namedBrake = /^brake_light/i.test(child.name);
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const tailMaterial = materials.some((material) => material instanceof THREE.Material && material.name === 'LightTail');
    if (namedBrake || tailMaterial) lights.push(child);
  });
  // Dedupe
  return [...new Set(lights)];
}

export async function preloadVehicleModels(): Promise<void> {
  if (templates.size === VEHICLE_IDS.length) return;
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    const loader = new GLTFLoader();
    await Promise.all(VEHICLE_IDS.map(async (id) => {
      const gltf = await loader.loadAsync(modelUrl(id));
      const root = gltf.scene;
      root.name = `template_${id}`;
      root.updateMatrixWorld(true);
      templates.set(id, root);
    }));
  })();

  try {
    await preloadPromise;
  } catch (error) {
    preloadPromise = null;
    throw error;
  }
}

export function isVehicleModelsReady(): boolean {
  return templates.size === VEHICLE_IDS.length;
}

export interface InstantiatedCar {
  root: THREE.Group;
  wheels: THREE.Group[];
  brakeLights: THREE.Mesh[];
  bodyMaterial: THREE.MeshStandardMaterial;
  bodyMaterials: THREE.MeshStandardMaterial[];
  collisionHalfExtents: THREE.Vector3;
}

export function instantiateVehicleModel(vehicleId: VehicleId, color: string): InstantiatedCar {
  const template = templates.get(vehicleId);
  if (!template) {
    throw new Error(`Vehicle model "${vehicleId}" is not loaded. Call preloadVehicleModels() first.`);
  }

  // Blender +Y forward exports as glTF -Z; gameplay forward is +Z.
  const root = new THREE.Group();
  root.name = `car_${vehicleId}`;
  const visual = template.clone(true);
  visual.rotation.y = Math.PI;
  visual.updateMatrixWorld(true);
  root.add(visual);
  cloneMaterials(root);

  const bodyMaterials = collectBodyMaterials(root);
  for (const material of bodyMaterials) {
    material.color.set(color);
    material.metalness = Math.max(material.metalness, 0.45);
    material.roughness = Math.min(material.roughness, 0.35);
  }
  const bodyMaterial = bodyMaterials[0];

  const wheels = collectWheels(root);
  const brakeLights = collectBrakeLights(root);
  if (brakeLights.length === 0) {
    console.warn(`Vehicle "${vehicleId}" has no brake light meshes.`);
  }

  // Ensure brake materials are standard + emissive for runtime updates
  for (const light of brakeLights) {
    if (!(light.material instanceof THREE.MeshStandardMaterial)) {
      light.material = new THREE.MeshStandardMaterial({
        color: 0xff263f,
        emissive: 0x8a0718,
        emissiveIntensity: 1.5,
        roughness: 0.25
      });
    } else {
      light.material.emissive.setHex(0x8a0718);
      light.material.emissiveIntensity = Math.max(light.material.emissiveIntensity, 1.5);
    }
  }

  return {
    root,
    wheels,
    brakeLights,
    bodyMaterial,
    bodyMaterials,
    collisionHalfExtents: halfExtents[vehicleId].clone()
  };
}
