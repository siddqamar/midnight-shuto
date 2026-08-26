import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VehicleId } from '../core/types';
import { InstrumentCluster } from './InstrumentCluster';

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

function upgradeMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const upgraded = materials.map((material) => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return material;

      if (material.name === 'BodyPaint') {
        const paint = new THREE.MeshPhysicalMaterial({
          color: material.color,
          metalness: Math.max(material.metalness, 0.58),
          roughness: Math.min(material.roughness, 0.21),
          clearcoat: 0.92,
          clearcoatRoughness: 0.1,
          envMapIntensity: 1.15
        });
        paint.name = material.name;
        return paint;
      }

      if (material.name === 'Glass') {
        material.color.setRGB(0.035, 0.075, 0.12);
        material.metalness = 0.22;
        material.roughness = 0.08;
        material.transparent = true;
        material.opacity = 0.58;
        material.envMapIntensity = 1.35;
        material.depthWrite = false;
        material.side = THREE.FrontSide;
      } else if (material.name === 'Windshield') {
        const glass = new THREE.MeshPhysicalMaterial({
          color: 0x9eb8c8,
          metalness: 0.04,
          roughness: 0.04,
          transparent: true,
          opacity: 0.16,
          transmission: 0.0,
          envMapIntensity: 1.6,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        glass.name = 'Windshield';
        return glass;
      } else if (material.name === 'LightHead') {
        material.color.setHex(0xddeeff);
        material.emissive.setHex(0x8fc9ff);
        material.emissiveIntensity = Math.max(material.emissiveIntensity, 2.8);
        material.roughness = 0.14;
      } else if (material.name === 'LightTail') {
        material.color.setHex(0xff243f);
        material.emissive.setHex(0xa7071f);
        material.emissiveIntensity = Math.max(material.emissiveIntensity, 2.1);
      } else if (material.name === 'Chrome' || material.name === 'Rim') {
        material.metalness = Math.max(material.metalness, 0.88);
        material.roughness = Math.min(material.roughness, 0.2);
        material.envMapIntensity = 1.3;
      }
      return material;
    });
    child.material = Array.isArray(child.material) ? upgraded : upgraded[0];
  });
}

function addHeadlightRig(root: THREE.Group, extents: THREE.Vector3): void {
  const rig = new THREE.Group();
  rig.name = 'headlight_rig';
  const lensMaterial = new THREE.MeshBasicMaterial({ color: 0xc8e6ff, transparent: true, opacity: 0.55 });
  const front = extents.z + 0.035;

  for (const side of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), lensMaterial);
    lens.position.set(side * (extents.x * 0.64), 0.48, front);
    lens.scale.set(1.45, 0.55, 0.45);
    rig.add(lens);

    const light = new THREE.SpotLight(0xb8dcff, 22, 30, 0.38, 0.78, 2);
    light.position.set(side * (extents.x * 0.58), 0.52, front - 0.03);
    light.target.position.set(side * 0.7, 0.05, 13);
    light.castShadow = false;
    rig.add(light, light.target);
  }

  root.add(rig);
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
    const parent = node.parent;
    if (!parent) throw new Error(`Vehicle wheel "${name}" has no parent.`);

    // Some exports place the wheel mesh at the axle but put the named node's
    // origin back near the vehicle center. Rotating that node makes the wheel
    // orbit instead of spinning in place. Build a pivot at the rendered wheel
    // bounds center and attach the imported node without changing its pose.
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(node);
    const pivotPosition = bounds.getCenter(new THREE.Vector3());
    parent.worldToLocal(pivotPosition);

    const pivot = new THREE.Group();
    pivot.name = `${name}_runtime_pivot`;
    parent.add(pivot);
    pivot.position.copy(pivotPosition);
    pivot.attach(node);
    wheels.push(pivot);
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
  steeringWheel?: THREE.Object3D;
  steeringBase: THREE.Quaternion;
  cabinGlass: THREE.Object3D[];
  cluster?: InstrumentCluster;
  interiorLight?: THREE.PointLight;
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
  upgradeMaterials(root);

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

  addHeadlightRig(root, halfExtents[vehicleId]);

  const steeringWheel = root.getObjectByName('steering_wheel');
  const steeringBase = steeringWheel ? steeringWheel.quaternion.clone() : new THREE.Quaternion();
  const cabinGlass: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (child.name === 'cabin_glass') cabinGlass.push(child);
  });

  const clusterMesh = root.getObjectByName('cluster_screen');
  const cluster = clusterMesh instanceof THREE.Mesh ? new InstrumentCluster(clusterMesh, vehicleId) : undefined;

  const lightAnchor = root.getObjectByName('interior_light');
  let interiorLight: THREE.PointLight | undefined;
  if (lightAnchor) {
    interiorLight = new THREE.PointLight(0xffd4b0, 0.55, 2.2, 2);
    interiorLight.name = 'cabin_fill';
    interiorLight.castShadow = false;
    lightAnchor.add(interiorLight);
  }

  return {
    root,
    wheels,
    brakeLights,
    bodyMaterial,
    bodyMaterials,
    collisionHalfExtents: halfExtents[vehicleId].clone(),
    steeringWheel,
    steeringBase,
    cabinGlass,
    cluster,
    interiorLight
  };
}
