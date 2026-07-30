import * as THREE from 'three';
import type { VehicleId } from '../core/types';

export interface CarModel extends THREE.Group {
  userData: {
    wheels: THREE.Group[];
    brakeLights: THREE.Mesh[];
    bodyMaterial: THREE.MeshStandardMaterial;
    collisionHalfExtents: THREE.Vector3;
    vehicleId: VehicleId;
  };
}

interface ModelStyle {
  length: number;
  width: number;
  wheelRadius: number;
  wheelWidth: number;
  wheelX: number;
  rearAxle: number;
  frontAxle: number;
  glassWidth: number;
  bodyProfile: Array<[number, number]>;
  glassProfile: Array<[number, number]>;
  rimColor: number;
}

const sharedGeometry = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 20),
  wheel: new THREE.CylinderGeometry(1, 1, 1, 24),
  sphere: new THREE.SphereGeometry(1, 16, 10),
  torus: new THREE.TorusGeometry(1, 0.12, 8, 28)
};

const profileGeometry = new Map<string, THREE.BufferGeometry>();

const styles: Record<VehicleId, ModelStyle> = {
  kaze: {
    length: 4.34,
    width: 1.92,
    wheelRadius: 0.39,
    wheelWidth: 0.27,
    wheelX: 1.01,
    rearAxle: -1.38,
    frontAxle: 1.39,
    glassWidth: 1.7,
    bodyProfile: [[-2.17, 0.37], [-2.17, 0.76], [-1.78, 0.91], [-0.92, 1.01], [0.72, 0.98], [1.55, 0.83], [2.17, 0.64], [2.17, 0.37]],
    glassProfile: [[-1.25, 0.95], [-0.87, 1.48], [0.55, 1.47], [1.09, 0.97]],
    rimColor: 0xc8cdd2
  },
  michi: {
    length: 4.16,
    width: 1.96,
    wheelRadius: 0.41,
    wheelWidth: 0.29,
    wheelX: 1.03,
    rearAxle: -1.31,
    frontAxle: 1.32,
    glassWidth: 1.72,
    bodyProfile: [[-2.08, 0.37], [-2.08, 0.9], [-1.58, 1.01], [0.95, 1.01], [1.58, 0.86], [2.08, 0.65], [2.08, 0.37]],
    glassProfile: [[-1.62, 0.97], [-1.48, 1.57], [0.61, 1.53], [1.28, 1.0]],
    rimColor: 0xb88932
  },
  raiden: {
    length: 4.76,
    width: 1.94,
    wheelRadius: 0.42,
    wheelWidth: 0.28,
    wheelX: 1.02,
    rearAxle: -1.5,
    frontAxle: 1.58,
    glassWidth: 1.7,
    bodyProfile: [[-2.32, 0.37], [-2.3, 0.8], [-1.7, 0.96], [-0.75, 1.01], [1.42, 0.89], [2.38, 0.64], [2.38, 0.37]],
    glassProfile: [[-1.48, 0.95], [-0.98, 1.43], [0.5, 1.45], [0.91, 0.99]],
    rimColor: 0xd4d6d8
  },
  shogun: {
    length: 4.72,
    width: 2.04,
    wheelRadius: 0.43,
    wheelWidth: 0.31,
    wheelX: 1.08,
    rearAxle: -1.46,
    frontAxle: 1.57,
    glassWidth: 1.78,
    bodyProfile: [[-2.36, 0.34], [-2.32, 0.91], [-1.38, 1.02], [-0.2, 0.97], [1.42, 0.76], [2.36, 0.48], [2.36, 0.34]],
    glassProfile: [[-1.3, 0.95], [-0.82, 1.36], [0.49, 1.36], [1.08, 0.87]],
    rimColor: 0xc5c8cb
  }
};

function getProfileGeometry(key: string, points: Array<[number, number]>, width: number, tapered = false): THREE.BufferGeometry {
  const cached = profileGeometry.get(key);
  if (cached) return cached;
  const positions: number[] = [];
  const indices: number[] = [];
  const minimumZ = Math.min(...points.map(([z]) => z));
  const maximumZ = Math.max(...points.map(([z]) => z));
  for (const side of [-1, 1]) {
    for (const [z, y] of points) {
      const nose = tapered ? Math.max(0, (z - maximumZ * 0.38) / (maximumZ * 0.62)) : 0;
      const tail = tapered ? Math.max(0, (-z + minimumZ * 0.5) / (-minimumZ * 0.5)) : 0;
      const widthScale = 1 - nose * 0.12 - tail * 0.035;
      positions.push(side * width / 2 * widthScale, y, z);
    }
  }
  const count = points.length;
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    indices.push(index, next, count + next, index, count + next, count + index);
  }
  for (let index = 1; index < count - 1; index += 1) {
    indices.push(0, index + 1, index);
    indices.push(count, count + index, count + index + 1);
  }
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  indexed.setIndex(indices);
  const result = indexed.toNonIndexed();
  indexed.dispose();
  result.computeVertexNormals();
  profileGeometry.set(key, result);
  return result;
}

function addPart(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
  scale: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0]
): THREE.Mesh {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(...position);
  part.scale.set(...scale);
  part.rotation.set(...rotation);
  part.castShadow = !(material instanceof THREE.MeshBasicMaterial);
  part.receiveShadow = true;
  parent.add(part);
  return part;
}

function addWheels(car: THREE.Group, style: ModelStyle, tireMaterial: THREE.Material, rimMaterial: THREE.Material, brakeMaterial: THREE.Material): THREE.Group[] {
  const wheels: THREE.Group[] = [];
  for (const x of [-style.wheelX, style.wheelX]) {
    for (const z of [style.rearAxle, style.frontAxle]) {
      const wheel = new THREE.Group();
      wheel.position.set(x, style.wheelRadius, z);
      car.add(wheel);
      wheels.push(wheel);

      addPart(wheel, sharedGeometry.wheel, tireMaterial, [0, 0, 0], [style.wheelRadius, style.wheelWidth, style.wheelRadius], [0, 0, Math.PI / 2]);
      const outside = Math.sign(x) * style.wheelWidth * 0.53;
      addPart(wheel, sharedGeometry.cylinder, brakeMaterial, [outside * 0.72, 0, 0], [style.wheelRadius * 0.42, style.wheelWidth * 0.08, style.wheelRadius * 0.42], [0, 0, Math.PI / 2]);
      addPart(wheel, sharedGeometry.cylinder, rimMaterial, [outside, 0, 0], [style.wheelRadius * 0.18, style.wheelWidth * 0.08, style.wheelRadius * 0.18], [0, 0, Math.PI / 2]);
      for (let spoke = 0; spoke < 5; spoke += 1) {
        addPart(
          wheel,
          sharedGeometry.box,
          rimMaterial,
          [outside, 0, 0],
          [style.wheelWidth * 0.12, style.wheelRadius * 0.72, 0.045],
          [(spoke / 5) * Math.PI, 0, 0]
        );
      }
    }
  }
  return wheels;
}

function addCabinDetails(car: THREE.Group, style: ModelStyle, bodyMaterial: THREE.Material, glassMaterial: THREE.Material, trimMaterial: THREE.Material): void {
  addPart(
    car,
    getProfileGeometry(`glass-${style.length}`, style.glassProfile, style.glassWidth),
    glassMaterial,
    [0, 0, 0],
    [1, 1, 1]
  );
  const cabinCenter = (style.glassProfile[0][0] + style.glassProfile.at(-1)![0]) / 2;
  for (const x of [-style.glassWidth / 2 - 0.025, style.glassWidth / 2 + 0.025]) {
    addPart(car, sharedGeometry.box, trimMaterial, [x, 1.2, cabinCenter], [0.045, 0.53, 0.07], [0.16, 0, 0]);
    addPart(car, sharedGeometry.box, bodyMaterial, [x, 1.48, cabinCenter - 0.04], [0.07, 0.08, 1.18]);
  }
  for (const x of [-style.width / 2 - 0.1, style.width / 2 + 0.1]) {
    addPart(car, sharedGeometry.box, bodyMaterial, [x, 1.12, 0.45], [0.2, 0.11, 0.3], [0, 0, x < 0 ? -0.08 : 0.08]);
  }
}

function addSideDetails(car: THREE.Group, style: ModelStyle, trimMaterial: THREE.Material, chromeMaterial: THREE.Material): void {
  for (const x of [-style.width / 2 - 0.035, style.width / 2 + 0.035]) {
    addPart(car, sharedGeometry.box, trimMaterial, [x, 0.48, 0], [0.07, 0.13, style.length * 0.72]);
    addPart(car, sharedGeometry.box, chromeMaterial, [x, 0.94, -0.28], [0.035, 0.035, 0.24]);
    const seamGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0.56, -1.04),
      new THREE.Vector3(x, 1.03, -0.96),
      new THREE.Vector3(x, 1.03, 0.63),
      new THREE.Vector3(x, 0.56, 0.72)
    ]);
    car.add(new THREE.LineLoop(seamGeometry, new THREE.LineBasicMaterial({ color: 0x17202a, transparent: true, opacity: 0.72 })));
  }
  addPart(car, sharedGeometry.box, trimMaterial, [0, 0.35, 0], [style.width * 0.9, 0.12, style.length * 0.9]);
}

function addExhausts(car: THREE.Group, positions: number[], rearZ: number, metalMaterial: THREE.Material): void {
  for (const x of positions) {
    addPart(car, sharedGeometry.cylinder, metalMaterial, [x, 0.43, rearZ], [0.095, 0.28, 0.095], [Math.PI / 2, 0, 0]);
  }
}

function addKazeDetails(car: THREE.Group, materials: ModelMaterials, brakeLights: THREE.Mesh[]): void {
  for (const x of [-0.61, 0.61]) {
    addPart(car, sharedGeometry.box, materials.headlight, [x, 0.72, 2.2], [0.48, 0.16, 0.055]);
    addPart(car, sharedGeometry.box, materials.indicator, [x < 0 ? -0.94 : 0.94, 0.67, 2.2], [0.17, 0.12, 0.06]);
    brakeLights.push(addPart(car, sharedGeometry.box, materials.tail, [x, 0.73, -2.2], [0.48, 0.16, 0.055]));
  }
  addPart(car, sharedGeometry.box, materials.trim, [0, 0.49, 2.2], [1.1, 0.17, 0.07]);
  addPart(car, sharedGeometry.box, materials.trim, [0, 0.51, -2.2], [1.2, 0.13, 0.07]);
  addPart(car, sharedGeometry.box, materials.chrome, [0, 0.64, -2.21], [0.38, 0.11, 0.025]);
  addPart(car, sharedGeometry.box, materials.body, [0, 1.01, -1.84], [1.4, 0.055, 0.22], [-0.06, 0, 0]);
  addExhausts(car, [0.72], -2.27, materials.chrome);
}

function addMichiDetails(car: THREE.Group, materials: ModelMaterials, brakeLights: THREE.Mesh[]): void {
  for (const x of [-0.62, 0.62]) {
    addPart(car, sharedGeometry.box, materials.headlight, [x, 0.75, 2.11], [0.5, 0.18, 0.055]);
    addPart(car, sharedGeometry.sphere, materials.headlight, [x, 0.51, 2.14], [0.16, 0.16, 0.055]);
    brakeLights.push(addPart(car, sharedGeometry.box, materials.tail, [x < 0 ? -0.78 : 0.78, 0.84, -2.11], [0.22, 0.36, 0.055]));
  }
  addPart(car, sharedGeometry.box, materials.trim, [0, 0.5, 2.12], [1.22, 0.25, 0.065]);
  addPart(car, sharedGeometry.box, materials.trim, [0, 1.07, 1.12], [0.58, 0.09, 0.4], [-0.09, 0, 0]);
  addPart(car, sharedGeometry.box, materials.body, [0, 1.63, -1.61], [1.55, 0.075, 0.34], [-0.09, 0, 0]);
  for (const x of [-0.57, 0.57]) addPart(car, sharedGeometry.box, materials.trim, [x, 1.49, -1.58], [0.07, 0.28, 0.08], [-0.09, 0, 0]);
  addExhausts(car, [-0.67], -2.18, materials.chrome);
}

function addRaidenDetails(car: THREE.Group, materials: ModelMaterials, brakeLights: THREE.Mesh[]): void {
  addPart(car, sharedGeometry.box, materials.trim, [0, 0.61, 2.4], [1.12, 0.31, 0.035]);
  addPart(car, sharedGeometry.torus, materials.chrome, [0, 0.63, 2.43], [0.52, 0.2, 0.06]);
  for (const x of [-0.7, -0.4, 0.4, 0.7]) {
    addPart(car, sharedGeometry.sphere, materials.headlight, [x, 0.84, 2.4], [0.13, 0.13, 0.045]);
  }
  for (const x of [-0.7, 0.7]) {
    addPart(car, sharedGeometry.sphere, materials.indicator, [x, 0.53, 2.42], [0.09, 0.09, 0.04]);
    brakeLights.push(addPart(car, sharedGeometry.sphere, materials.tail, [x, 0.72, -2.34], [0.29, 0.16, 0.055]));
  }
  addPart(car, sharedGeometry.box, materials.chrome, [0, 0.88, -2.34], [0.78, 0.045, 0.04]);
  addExhausts(car, [-0.7, 0.7], -2.43, materials.chrome);
}

function addShogunDetails(car: THREE.Group, materials: ModelMaterials, brakeLights: THREE.Mesh[]): void {
  for (const x of [-0.61, 0.61]) {
    addPart(car, sharedGeometry.box, materials.body, [x, 0.84, 1.46], [0.48, 0.13, 0.5], [-0.14, 0, 0]);
    addPart(car, sharedGeometry.box, materials.headlight, [x, 0.78, 1.75], [0.4, 0.08, 0.035], [-0.14, 0, 0]);
    brakeLights.push(addPart(car, sharedGeometry.box, materials.tail, [x, 0.73, -2.39], [0.54, 0.13, 0.055]));
  }
  for (const x of [-0.68, 0.68]) {
    addPart(car, sharedGeometry.box, materials.trim, [x, 0.47, 2.39], [0.49, 0.2, 0.06], [0, x < 0 ? -0.1 : 0.1, 0]);
    addPart(car, sharedGeometry.box, materials.trim, [x < 0 ? -1.035 : 1.035, 0.67, -0.56], [0.04, 0.33, 0.52], [0, 0, x < 0 ? 0.16 : -0.16]);
  }
  addPart(car, sharedGeometry.box, materials.trim, [0, 0.45, -2.39], [1.55, 0.21, 0.06]);
  addPart(car, sharedGeometry.box, materials.body, [0, 1.19, -1.89], [1.72, 0.075, 0.35], [-0.04, 0, 0]);
  for (const x of [-0.64, 0.64]) addPart(car, sharedGeometry.box, materials.trim, [x, 1.03, -1.88], [0.08, 0.34, 0.09]);
  addExhausts(car, [-0.74, 0.74], -2.47, materials.chrome);
}

interface ModelMaterials {
  body: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  headlight: THREE.MeshStandardMaterial;
  indicator: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
}

export function createCarModel(vehicleId: VehicleId, color: string, accent = '#141821'): CarModel {
  const car = new THREE.Group() as CarModel;
  const style = styles[vehicleId];
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.24, metalness: 0.62 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.42, metalness: 0.45 });
  const chromeMaterial = new THREE.MeshStandardMaterial({ color: 0xd8dde1, roughness: 0.2, metalness: 0.92 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x101b29, roughness: 0.1, metalness: 0.38, transparent: true, opacity: 0.9 });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x090a0c, roughness: 0.96 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: style.rimColor, roughness: 0.24, metalness: 0.88 });
  const brakeMaterial = new THREE.MeshStandardMaterial({ color: 0x5e6468, roughness: 0.46, metalness: 0.78 });
  const materials: ModelMaterials = {
    body: bodyMaterial,
    trim: trimMaterial,
    chrome: chromeMaterial,
    headlight: new THREE.MeshStandardMaterial({ color: 0xdce9ef, emissive: 0xa9d8ff, emissiveIntensity: 1.4, roughness: 0.18, metalness: 0.2 }),
    indicator: new THREE.MeshStandardMaterial({ color: 0xffa529, emissive: 0xc85b08, emissiveIntensity: 1.2, roughness: 0.24 }),
    tail: new THREE.MeshStandardMaterial({ color: 0xff263f, emissive: 0x8a0718, emissiveIntensity: 1.5, roughness: 0.22 })
  };

  addPart(car, getProfileGeometry(`body-${vehicleId}`, style.bodyProfile, style.width, true), bodyMaterial, [0, 0, 0], [1, 1, 1]);
  addCabinDetails(car, style, bodyMaterial, glassMaterial, trimMaterial);
  addSideDetails(car, style, trimMaterial, chromeMaterial);
  const wheels = addWheels(car, style, tireMaterial, rimMaterial, brakeMaterial);
  const brakeLights: THREE.Mesh[] = [];

  switch (vehicleId) {
    case 'kaze':
      addKazeDetails(car, materials, brakeLights);
      break;
    case 'michi':
      addMichiDetails(car, materials, brakeLights);
      break;
    case 'raiden':
      addRaidenDetails(car, materials, brakeLights);
      break;
    case 'shogun':
      addShogunDetails(car, materials, brakeLights);
      break;
  }

  car.userData = {
    wheels,
    brakeLights,
    bodyMaterial,
    collisionHalfExtents: new THREE.Vector3(style.width * 0.48, 0.42, style.length * 0.47),
    vehicleId
  };
  return car;
}
