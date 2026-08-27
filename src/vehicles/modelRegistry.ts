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
let paintMaps: { roughnessMap: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } | null = null;
let glowMap: THREE.CanvasTexture | null = null;

function makeNoiseTexture(size: number, contrast: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const image = context.createImageData(size, size);
  for (let index = 0; index < image.data.length; index += 4) {
    const value = 150 + Math.random() * contrast;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.repeat.set(4, 8);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function getPaintMaps(): { roughnessMap: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  if (!paintMaps) {
    paintMaps = {
      roughnessMap: makeNoiseTexture(128, 55),
      bumpMap: makeNoiseTexture(128, 40)
    };
  }
  return paintMaps;
}

function getGlowMap(): THREE.CanvasTexture {
  if (glowMap) return glowMap;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.28, 'rgba(190,220,255,0.55)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  glowMap = new THREE.CanvasTexture(canvas);
  glowMap.colorSpace = THREE.SRGBColorSpace;
  return glowMap;
}

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
  const maps = getPaintMaps();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const upgraded = materials.map((material) => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return material;

      if (material.name === 'BodyPaint') {
        const paint = new THREE.MeshPhysicalMaterial({
          color: material.color,
          metalness: 0.52,
          roughness: 0.22,
          roughnessMap: maps.roughnessMap,
          bumpMap: maps.bumpMap,
          bumpScale: 0.006,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
          sheen: 0.22,
          sheenColor: material.color.clone().multiplyScalar(1.08),
          sheenRoughness: 0.45,
          envMapIntensity: 1.35
        });
        paint.name = material.name;
        return paint;
      }

      if (material.name === 'Glass') {
        const glass = new THREE.MeshPhysicalMaterial({
          color: 0x071018,
          metalness: 0.08,
          roughness: 0.045,
          transparent: true,
          opacity: 0.78,
          envMapIntensity: 1.85,
          depthWrite: false,
          side: THREE.FrontSide
        });
        glass.name = 'Glass';
        return glass;
      }

      if (material.name === 'Windshield') {
        const glass = new THREE.MeshPhysicalMaterial({
          color: 0x9eb8c8,
          metalness: 0.04,
          roughness: 0.03,
          transparent: true,
          opacity: 0.14,
          envMapIntensity: 1.7,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        glass.name = 'Windshield';
        return glass;
      }

      if (material.name === 'LightLens') {
        const lens = new THREE.MeshPhysicalMaterial({
          color: 0xcfe6ff,
          metalness: 0.05,
          roughness: 0.04,
          transparent: true,
          opacity: 0.28,
          envMapIntensity: 1.6,
          depthWrite: false
        });
        lens.name = 'LightLens';
        return lens;
      }

      if (material.name === 'LightHead') {
        material.color.setHex(0xe8f4ff);
        material.emissive.setHex(0xb7dcff);
        material.emissiveIntensity = Math.max(material.emissiveIntensity, 3.4);
        material.roughness = 0.08;
        material.metalness = 0.12;
      } else if (material.name === 'LightTail') {
        material.color.setHex(0xff2a42);
        material.emissive.setHex(0xc10820);
        material.emissiveIntensity = Math.max(material.emissiveIntensity, 2.6);
        material.roughness = 0.16;
      } else if (material.name === 'Chrome') {
        const chrome = new THREE.MeshPhysicalMaterial({
          color: 0xdde4ec,
          metalness: 1,
          roughness: 0.1,
          envMapIntensity: 1.7,
          clearcoat: 0.35,
          clearcoatRoughness: 0.08
        });
        chrome.name = 'Chrome';
        return chrome;
      } else if (material.name === 'Rim') {
        const rim = new THREE.MeshPhysicalMaterial({
          color: material.color,
          metalness: 0.94,
          roughness: 0.16,
          envMapIntensity: 1.45
        });
        rim.name = 'Rim';
        return rim;
      } else if (material.name === 'Rubber' || material.name === 'TireWall') {
        material.color.setHex(material.name === 'Rubber' ? 0x09090c : 0x16181c);
        material.metalness = 0.02;
        material.roughness = material.name === 'Rubber' ? 0.94 : 0.78;
      } else if (material.name === 'Brake') {
        material.metalness = 0.86;
        material.roughness = 0.3;
        material.envMapIntensity = 1.2;
      } else if (material.name === 'Caliper') {
        material.metalness = 0.55;
        material.roughness = 0.28;
        material.envMapIntensity = 1.1;
      } else if (material.name === 'Mirror') {
        material.metalness = 1;
        material.roughness = 0.05;
        material.envMapIntensity = 1.8;
      }
      return material;
    });
    child.material = Array.isArray(child.material) ? upgraded : upgraded[0];
  });
}

function addHeadlightRig(root: THREE.Group, extents: THREE.Vector3): void {
  root.updateMatrixWorld(true);
  const rig = new THREE.Group();
  rig.name = 'headlight_rig';
  const glowMaterial = new THREE.SpriteMaterial({
    map: getGlowMap(),
    color: 0xc4e4ff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.72
  });

  const positions: THREE.Vector3[] = [];
  for (const name of ['head_socket_L', 'head_socket_R']) {
    const socket = root.getObjectByName(name);
    if (socket) positions.push(root.worldToLocal(socket.getWorldPosition(new THREE.Vector3())));
  }
  if (positions.length < 2) {
    positions.length = 0;
    positions.push(
      new THREE.Vector3(-extents.x * 0.58, 0.52, extents.z + 0.02),
      new THREE.Vector3(extents.x * 0.58, 0.52, extents.z + 0.02)
    );
  }

  for (const [index, position] of positions.entries()) {
    const side = position.x < 0 ? -1 : 1;
    const glow = new THREE.Sprite(glowMaterial);
    glow.name = `head_glow_${index}`;
    glow.position.copy(position);
    glow.position.z += 0.04;
    glow.scale.set(0.55, 0.32, 1);
    rig.add(glow);

    const light = new THREE.SpotLight(0xc4e2ff, 28, 34, 0.36, 0.72, 1.8);
    light.position.copy(position);
    light.target.position.set(side * 0.55, 0.02, 14);
    light.castShadow = false;
    rig.add(light, light.target);
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 22),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.38,
      depthWrite: false
    })
  );
  shadow.name = 'contact_shadow';
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.scale.set(extents.x * 1.15, extents.z * 1.05, 1);
  shadow.renderOrder = -1;
  rig.add(shadow);

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

    // Older exports preserve each wheel mesh's world position while parenting
    // it to an axle socket, leaving the rendered wheel at the chassis origin.
    // Move that subtree onto its authored socket before creating a spin pivot.
    root.updateMatrixWorld(true);
    const socketPosition = node.getWorldPosition(new THREE.Vector3());
    const renderedPosition = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
    const localSocket = parent.worldToLocal(socketPosition.clone());
    const localRendered = parent.worldToLocal(renderedPosition.clone());
    node.position.add(localSocket.sub(localRendered));
    root.updateMatrixWorld(true);

    const pivot = new THREE.Group();
    pivot.name = `${name}_runtime_pivot`;
    parent.add(pivot);
    pivot.position.copy(parent.worldToLocal(socketPosition));
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
    if (material instanceof THREE.MeshPhysicalMaterial) {
      material.sheenColor.set(color).multiplyScalar(1.12);
    }
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
