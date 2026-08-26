import * as THREE from 'three';
import type { VehicleId } from '../core/types';
import { instantiateVehicleModel } from './modelRegistry';
import type { InstrumentCluster } from './InstrumentCluster';

export interface CarModel extends THREE.Group {
  userData: {
    wheels: THREE.Group[];
    brakeLights: THREE.Mesh[];
    bodyMaterial: THREE.MeshStandardMaterial;
    bodyMaterials: THREE.MeshStandardMaterial[];
    collisionHalfExtents: THREE.Vector3;
    vehicleId: VehicleId;
    steeringWheel?: THREE.Object3D;
    steeringBase: THREE.Quaternion;
    cabinGlass: THREE.Object3D[];
    cluster?: InstrumentCluster;
    interiorLight?: THREE.PointLight;
  };
}

/**
 * Build a gameplay car instance from a preloaded GLB template.
 * Call `preloadVehicleModels()` before the first create.
 */
export function createCarModel(vehicleId: VehicleId, color: string, _accent = '#141821'): CarModel {
  const instance = instantiateVehicleModel(vehicleId, color);
  const car = instance.root as CarModel;
  car.userData = {
    wheels: instance.wheels,
    brakeLights: instance.brakeLights,
    bodyMaterial: instance.bodyMaterial,
    bodyMaterials: instance.bodyMaterials,
    collisionHalfExtents: instance.collisionHalfExtents,
    vehicleId,
    steeringWheel: instance.steeringWheel,
    steeringBase: instance.steeringBase,
    cabinGlass: instance.cabinGlass,
    cluster: instance.cluster,
    interiorLight: instance.interiorLight
  };
  return car;
}
