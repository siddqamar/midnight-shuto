import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { ROAD_SPACING } from '../core/config';
import { damp, seededRandom } from '../utils/math';

interface TrafficCar {
  model: THREE.Group;
  body: CANNON.Body;
  route: THREE.Vector3[];
  segment: number;
  speed: number;
  cruise: number;
}

const colors = ['#d7dde2', '#1b1f26', '#d64141', '#d8c856', '#3b76bd', '#4d555a', '#f0eee2'];

function createTrafficModel(color: string): THREE.Group {
  const profile: Array<[number, number]> = [
    [-2.15, 0], [-2.15, 0.55], [-1.12, 1.22], [0.72, 1.18], [2.15, 0.52], [2.15, 0]
  ];
  const positions: number[] = [];
  for (const x of [-0.96, 0.96]) {
    for (const [z, y] of profile) positions.push(x, y, z);
  }
  const indices: number[] = [];
  for (let side = 0; side < 2; side += 1) {
    const start = side * profile.length;
    for (let index = 1; index < profile.length - 1; index += 1) {
      indices.push(start, start + index, start + index + 1);
    }
  }
  for (let index = 0; index < profile.length - 1; index += 1) {
    const left = index;
    const right = index + profile.length;
    indices.push(left, right, left + 1, right, right + 1, left + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.32, side: THREE.DoubleSide });
  const model = new THREE.Group();
  const shell = new THREE.Mesh(geometry, material);
  shell.position.y = 0.05;
  model.add(shell);
  return model;
}

function rectangleRoute(minX: number, maxX: number, minZ: number, maxZ: number, clockwise: boolean): THREE.Vector3[] {
  const lane = clockwise ? -6 : 6;
  const points = [
    new THREE.Vector3(minX + lane, 0.62, minZ - lane),
    new THREE.Vector3(minX + lane, 0.62, maxZ + lane),
    new THREE.Vector3(maxX - lane, 0.62, maxZ + lane),
    new THREE.Vector3(maxX - lane, 0.62, minZ - lane)
  ];
  return clockwise ? points : points.reverse();
}

export class TrafficSystem {
  private cars: TrafficCar[] = [];
  private signals: Array<{ bulbs: THREE.Mesh[]; phase: number }> = [];

  constructor(scene: THREE.Scene, physics: CANNON.World, amount: number) {
    const routes = [
      rectangleRoute(-480, 480, -480, 480, true),
      rectangleRoute(-360, 360, -360, 360, false),
      rectangleRoute(-600, 240, -240, 360, true),
      rectangleRoute(-240, 600, -600, 120, false),
      rectangleRoute(-120, 480, -120, 600, true)
    ];
    const random = seededRandom(82718);
    for (let index = 0; index < amount; index += 1) {
      const route = routes[index % routes.length];
      const segment = index % route.length;
      const model = createTrafficModel(colors[index % colors.length]);
      const scale = index % 9 === 0 ? 1.16 : index % 7 === 0 ? 0.9 : 0.84;
      model.scale.set(scale, scale, scale);
      model.position.copy(route[segment]);
      model.traverse((child) => { child.castShadow = false; });
      scene.add(model);

      const body = new CANNON.Body({
        mass: 0,
        type: CANNON.Body.KINEMATIC,
        shape: new CANNON.Box(new CANNON.Vec3(0.88 * scale, 0.38 * scale, 1.82 * scale)),
        position: new CANNON.Vec3(model.position.x, model.position.y, model.position.z)
      });
      physics.addBody(body);
      this.cars.push({
        model,
        body,
        route,
        segment,
        speed: 7 + random() * 4,
        cruise: 10 + random() * 7
      });
    }
    this.createSignals(scene);
  }

  update(dt: number, elapsed: number, playerPosition: THREE.Vector3): void {
    const cycle = elapsed % 16;
    for (const signal of this.signals) {
      const green = (cycle + signal.phase) % 16 < 8;
      (signal.bulbs[0].material as THREE.MeshBasicMaterial).color.setHex(green ? 0x251010 : 0xff3248);
      (signal.bulbs[1].material as THREE.MeshBasicMaterial).color.setHex(green ? 0x39ed83 : 0x10271a);
    }

    for (let carIndex = 0; carIndex < this.cars.length; carIndex += 1) {
      const car = this.cars[carIndex];
      const current = car.model.position;
      const target = car.route[(car.segment + 1) % car.route.length];
      const direction = target.clone().sub(current);
      const distance = direction.length();
      const atIntersection = Math.min(Math.abs(current.x % ROAD_SPACING), Math.abs(current.z % ROAD_SPACING)) < 13;
      const vertical = Math.abs(direction.z) > Math.abs(direction.x);
      const redLight = vertical ? cycle >= 8 : cycle < 8;
      const playerDistance = current.distanceTo(playerPosition);
      const yielding = playerDistance < 10 && this.isAhead(current, playerPosition, direction);
      const desired = (redLight && atIntersection) || yielding ? 0 : car.cruise;
      car.speed = damp(car.speed, desired, desired === 0 ? 3.2 : 0.8, dt);

      if (distance < 4.5) {
        car.segment = (car.segment + 1) % car.route.length;
      } else {
        direction.normalize();
        current.addScaledVector(direction, car.speed * dt);
        const desiredYaw = Math.atan2(direction.x, direction.z);
        car.model.rotation.y = this.dampAngle(car.model.rotation.y, desiredYaw, 6, dt);
      }

      car.body.position.set(current.x, current.y, current.z);
      car.body.quaternion.setFromEuler(0, car.model.rotation.y, 0);
      const velocityDirection = car.route[(car.segment + 1) % car.route.length].clone().sub(current).normalize();
      car.body.velocity.set(velocityDirection.x * car.speed, 0, velocityDirection.z * car.speed);
    }
  }

  get count(): number {
    return this.cars.length;
  }

  private isAhead(origin: THREE.Vector3, target: THREE.Vector3, direction: THREE.Vector3): boolean {
    const toTarget = target.clone().sub(origin).normalize();
    return toTarget.dot(direction.clone().normalize()) > 0.35;
  }

  private dampAngle(from: number, to: number, lambda: number, dt: number): number {
    let delta = (to - from + Math.PI) % (Math.PI * 2) - Math.PI;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return from + delta * (1 - Math.exp(-lambda * dt));
  }

  private createSignals(scene: THREE.Scene): void {
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x4c555d, roughness: 0.54, metalness: 0.68 });
    for (let index = -4; index <= 4; index += 2) {
      const coordinate = index * ROAD_SPACING;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 4.6, 7), poleMaterial);
      pole.position.set(coordinate + 15, 2.3, 15);
      const casing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.65, 0.48), new THREE.MeshStandardMaterial({ color: 0x171b20 }));
      casing.position.set(coordinate + 15, 4.32, 15);
      const red = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3248 }));
      red.position.set(coordinate + 15, 4.66, 14.73);
      const green = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 8), new THREE.MeshBasicMaterial({ color: 0x10271a }));
      green.position.set(coordinate + 15, 4.05, 14.73);
      scene.add(pole, casing, red, green);
      this.signals.push({ bulbs: [red, green], phase: index % 4 === 0 ? 0 : 8 });
    }
  }
}
