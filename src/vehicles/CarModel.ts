import * as THREE from 'three';

export interface CarModel extends THREE.Group {
  userData: {
    wheels: THREE.Mesh[];
    brakeLights: THREE.Mesh[];
    bodyMaterial: THREE.MeshStandardMaterial;
  };
}

const geometry = {
  lower: new THREE.BoxGeometry(2.02, 0.48, 4.3),
  cabin: new THREE.BoxGeometry(1.72, 0.62, 2.08),
  bumper: new THREE.BoxGeometry(2.06, 0.2, 0.24),
  light: new THREE.BoxGeometry(0.48, 0.12, 0.08),
  wheel: new THREE.CylinderGeometry(0.38, 0.38, 0.24, 14),
  rim: new THREE.CylinderGeometry(0.2, 0.2, 0.255, 12),
  spoiler: new THREE.BoxGeometry(1.45, 0.08, 0.28),
  post: new THREE.BoxGeometry(0.07, 0.27, 0.07)
};

export function createCarModel(color: string, accent = '#141821', sporty = true): CarModel {
  const car = new THREE.Group() as CarModel;
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.55 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.38, metalness: 0.48 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x172436, roughness: 0.12, metalness: 0.65 });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x090b0e, roughness: 0.95 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xb8c0ca, roughness: 0.25, metalness: 0.9 });

  const lower = new THREE.Mesh(geometry.lower, bodyMaterial);
  lower.position.y = 0.62;
  lower.castShadow = true;
  car.add(lower);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.2, 1.18), bodyMaterial);
  hood.position.set(0, 0.93, 1.34);
  hood.rotation.x = -0.04;
  hood.castShadow = true;
  car.add(hood);

  const cabin = new THREE.Mesh(geometry.cabin, glassMaterial);
  cabin.position.set(0, 1.17, -0.27);
  cabin.scale.set(0.92, 1, 1);
  cabin.castShadow = true;
  car.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.09, 1.44), bodyMaterial);
  roof.position.set(0, 1.52, -0.35);
  car.add(roof);

  for (const z of [-2.11, 2.11]) {
    const bumper = new THREE.Mesh(geometry.bumper, trimMaterial);
    bumper.position.set(0, 0.48, z);
    car.add(bumper);
  }

  const wheels: THREE.Mesh[] = [];
  for (const x of [-1.03, 1.03]) {
    for (const z of [-1.42, 1.42]) {
      const wheel = new THREE.Mesh(geometry.wheel, tireMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.39, z);
      wheel.castShadow = true;
      wheels.push(wheel);
      car.add(wheel);
      const rim = new THREE.Mesh(geometry.rim, rimMaterial);
      rim.rotation.z = Math.PI / 2;
      wheel.add(rim);
    }
  }

  const headlightsMaterial = new THREE.MeshBasicMaterial({ color: 0xd8edff, toneMapped: false });
  const tailMaterial = new THREE.MeshBasicMaterial({ color: 0xff263f, toneMapped: false });
  const brakeLights: THREE.Mesh[] = [];
  for (const x of [-0.62, 0.62]) {
    const headlight = new THREE.Mesh(geometry.light, headlightsMaterial);
    headlight.position.set(x, 0.72, 2.19);
    car.add(headlight);
    const tail = new THREE.Mesh(geometry.light, tailMaterial.clone());
    tail.position.set(x, 0.71, -2.19);
    tail.rotation.y = Math.PI;
    brakeLights.push(tail);
    car.add(tail);
  }

  if (sporty) {
    const wing = new THREE.Mesh(geometry.spoiler, trimMaterial);
    wing.position.set(0, 1.12, -1.82);
    car.add(wing);
    for (const x of [-0.52, 0.52]) {
      const post = new THREE.Mesh(geometry.post, trimMaterial);
      post.position.set(x, 0.97, -1.82);
      car.add(post);
    }
  }

  car.userData = { wheels, brakeLights, bodyMaterial };
  return car;
}
