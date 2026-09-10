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
  wheels: THREE.Group[];
  brakeLights: THREE.MeshStandardMaterial[];
  wheelSpin: number;
  braking: boolean;
  details: THREE.Object3D[];
  detailed: boolean;
}

const colors = ['#d7dde2', '#1b1f26', '#d64141', '#d8c856', '#3b76bd', '#4d555a', '#f0eee2'];

interface TrafficStyle {
  width: number;
  length: number;
  roofHeight: number;
  wheelRadius: number;
  cabinLength: number;
}

interface TrafficModel {
  root: THREE.Group;
  wheels: THREE.Group[];
  brakeLights: THREE.MeshStandardMaterial[];
  details: THREE.Object3D[];
}

interface TrafficGeometries {
  body: THREE.BoxGeometry;
  hood: THREE.BoxGeometry;
  trunk: THREE.BoxGeometry;
  cabin: THREE.BoxGeometry;
  roof: THREE.BoxGeometry;
  grille: THREE.BoxGeometry;
  splitter: THREE.BoxGeometry;
  diffuser: THREE.BoxGeometry;
  tire: THREE.CylinderGeometry;
  rim: THREE.CylinderGeometry;
  disc: THREE.CylinderGeometry;
  caliper: THREE.BoxGeometry;
  headlight: THREE.BoxGeometry;
  tail: THREE.BoxGeometry;
  mirror: THREE.BoxGeometry;
}

const trafficStyles: TrafficStyle[] = [
  { width: 1.74, length: 3.94, roofHeight: 0.54, wheelRadius: 0.28, cabinLength: 1.8 },
  { width: 1.84, length: 4.46, roofHeight: 0.48, wheelRadius: 0.31, cabinLength: 2.02 },
  { width: 1.9, length: 4.72, roofHeight: 0.43, wheelRadius: 0.33, cabinLength: 1.88 }
];

const geometryCache = new WeakMap<TrafficStyle, TrafficGeometries>();
const sharedMaterials = {
  trim: new THREE.MeshStandardMaterial({ color: 0x11151b, metalness: 0.46, roughness: 0.42 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x07111d, metalness: 0.45, roughness: 0.12, transparent: true, opacity: 0.82, depthWrite: false }),
  rim: new THREE.MeshStandardMaterial({ color: 0xbec8d2, metalness: 0.88, roughness: 0.22 }),
  headlight: new THREE.MeshStandardMaterial({ color: 0xdceeff, emissive: 0x91c7ff, emissiveIntensity: 2.6, roughness: 0.16 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x06070a, roughness: 0.9, metalness: 0.02 }),
  disc: new THREE.MeshStandardMaterial({ color: 0x8d949d, roughness: 0.32, metalness: 0.82 }),
  brake: new THREE.MeshStandardMaterial({ color: 0x6c0f18, roughness: 0.28, metalness: 0.55 })
};

function getTrafficGeometries(style: TrafficStyle): TrafficGeometries {
  const cached = geometryCache.get(style);
  if (cached) return cached;
  const geometries = {
    body: new THREE.BoxGeometry(style.width, 0.45, style.length),
    hood: new THREE.BoxGeometry(style.width * 0.93, 0.17, style.length * 0.31),
    trunk: new THREE.BoxGeometry(style.width * 0.9, 0.14, style.length * 0.2),
    cabin: new THREE.BoxGeometry(style.width * 0.75, style.roofHeight, style.cabinLength),
    roof: new THREE.BoxGeometry(style.width * 0.69, 0.06, style.cabinLength * 0.76),
    grille: new THREE.BoxGeometry(style.width * 0.5, 0.09, 0.18),
    splitter: new THREE.BoxGeometry(style.width * 0.88, 0.07, 0.18),
    diffuser: new THREE.BoxGeometry(style.width * 0.82, 0.08, 0.16),
    tire: new THREE.CylinderGeometry(style.wheelRadius, style.wheelRadius * 0.96, 0.22, 18),
    rim: new THREE.CylinderGeometry(style.wheelRadius * 0.61, style.wheelRadius * 0.61, 0.235, 16),
    disc: new THREE.CylinderGeometry(style.wheelRadius * 0.39, style.wheelRadius * 0.39, 0.245, 16),
    caliper: new THREE.BoxGeometry(0.08, style.wheelRadius * 0.3, style.wheelRadius * 0.38),
    headlight: new THREE.BoxGeometry(style.width * 0.2, 0.1, 0.07),
    tail: new THREE.BoxGeometry(style.width * 0.22, 0.11, 0.07),
    mirror: new THREE.BoxGeometry(0.11, 0.12, 0.07)
  } satisfies TrafficGeometries;
  geometryCache.set(style, geometries);
  return geometries;
}

function addTrafficWheel(root: THREE.Group, x: number, z: number, radius: number, geometries: TrafficGeometries): THREE.Group {
  const wheel = new THREE.Group();
  wheel.position.set(x, radius, z);
  const tire = new THREE.Mesh(geometries.tire, sharedMaterials.tire);
  tire.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(geometries.rim, sharedMaterials.rim);
  rim.rotation.z = Math.PI / 2;
  const disc = new THREE.Mesh(geometries.disc, sharedMaterials.disc);
  disc.rotation.z = Math.PI / 2;
  const caliper = new THREE.Mesh(geometries.caliper, sharedMaterials.brake);
  caliper.position.set(0.13, radius * 0.16, 0);
  wheel.add(tire, rim, disc, caliper);
  root.add(wheel);
  return wheel;
}

function createTrafficModel(color: string, style: TrafficStyle): TrafficModel {
  const root = new THREE.Group();
  const geometries = getTrafficGeometries(style);
  const paint = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.58,
    roughness: 0.23,
    clearcoat: 0.75,
    clearcoatRoughness: 0.18
  });
  const brakeLights = [
    new THREE.MeshStandardMaterial({ color: 0xff3148, emissive: 0x8d0618, emissiveIntensity: 1.5, roughness: 0.22 }),
    new THREE.MeshStandardMaterial({ color: 0xff3148, emissive: 0x8d0618, emissiveIntensity: 1.5, roughness: 0.22 })
  ];
  const halfLength = style.length * 0.5;
  const wheelZ = halfLength * 0.62;
  const wheelX = style.width * 0.52;
  const body = new THREE.Mesh(geometries.body, paint);
  body.position.y = style.wheelRadius + 0.22;
  const hood = new THREE.Mesh(geometries.hood, paint);
  hood.position.set(0, style.wheelRadius + 0.52, halfLength * 0.33);
  const trunk = new THREE.Mesh(geometries.trunk, paint);
  trunk.position.set(0, style.wheelRadius + 0.5, -halfLength * 0.36);
  const cabin = new THREE.Mesh(geometries.cabin, sharedMaterials.glass);
  cabin.position.set(0, style.wheelRadius + 0.59 + style.roofHeight * 0.5, -0.08);
  const roof = new THREE.Mesh(geometries.roof, paint);
  roof.position.set(0, style.wheelRadius + 0.62 + style.roofHeight, -0.08);
  const grille = new THREE.Mesh(geometries.grille, sharedMaterials.trim);
  grille.position.set(0, style.wheelRadius + 0.34, halfLength + 0.02);
  const splitter = new THREE.Mesh(geometries.splitter, sharedMaterials.trim);
  splitter.position.set(0, style.wheelRadius + 0.12, halfLength + 0.05);
  const diffuser = new THREE.Mesh(geometries.diffuser, sharedMaterials.trim);
  diffuser.position.set(0, style.wheelRadius + 0.14, -halfLength - 0.04);
  root.add(body, hood, trunk, cabin, roof, grille, splitter, diffuser);

  const wheels = [
    addTrafficWheel(root, -wheelX, wheelZ, style.wheelRadius, geometries),
    addTrafficWheel(root, wheelX, wheelZ, style.wheelRadius, geometries),
    addTrafficWheel(root, -wheelX, -wheelZ, style.wheelRadius, geometries),
    addTrafficWheel(root, wheelX, -wheelZ, style.wheelRadius, geometries)
  ];
  const details: THREE.Object3D[] = [...wheels, grille, splitter, diffuser];

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(geometries.headlight, sharedMaterials.headlight);
    lamp.position.set(side * style.width * 0.28, style.wheelRadius + 0.48, halfLength + 0.035);
    const tail = new THREE.Mesh(geometries.tail, brakeLights[side < 0 ? 0 : 1]);
    tail.position.set(side * style.width * 0.28, style.wheelRadius + 0.48, -halfLength - 0.035);
    const mirror = new THREE.Mesh(geometries.mirror, sharedMaterials.trim);
    mirror.position.set(side * (style.width * 0.5 + 0.06), style.wheelRadius + 0.86, 0.26);
    root.add(lamp, tail, mirror);
    details.push(mirror);
  }

  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return { root, wheels, brakeLights, details };
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
  private signals: Array<{ bulbs: THREE.Mesh[]; phase: number; green?: boolean }> = [];
  private renderDistanceSquared: number;
  private visibleCars = 0;

  constructor(scene: THREE.Scene, physics: CANNON.World, amount: number) {
    const renderDistance = amount <= 15 ? 280 : amount >= 30 ? 440 : 360;
    this.renderDistanceSquared = renderDistance * renderDistance;
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
      const created = createTrafficModel(colors[index % colors.length], trafficStyles[index % trafficStyles.length]);
      const model = created.root;
      const scale = index % 9 === 0 ? 1.16 : index % 7 === 0 ? 0.9 : 0.84;
      model.scale.set(scale, scale, scale);
      model.position.copy(route[segment]);
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
        cruise: 10 + random() * 7,
        wheels: created.wheels,
        brakeLights: created.brakeLights,
        wheelSpin: random() * Math.PI * 2,
        braking: false,
        details: created.details,
        detailed: true
      });
    }
    this.createSignals(scene);
  }

  update(dt: number, elapsed: number, playerPosition: THREE.Vector3): void {
    const cycle = elapsed % 16;
    for (const signal of this.signals) {
      const green = (cycle + signal.phase) % 16 < 8;
      if (signal.green === green) continue;
      signal.green = green;
      (signal.bulbs[0].material as THREE.MeshBasicMaterial).color.setHex(green ? 0x251010 : 0xff3248);
      (signal.bulbs[1].material as THREE.MeshBasicMaterial).color.setHex(green ? 0x39ed83 : 0x10271a);
    }

    this.visibleCars = 0;
    for (let carIndex = 0; carIndex < this.cars.length; carIndex += 1) {
      const car = this.cars[carIndex];
      const current = car.model.position;
      const target = car.route[(car.segment + 1) % car.route.length];
      let directionX = target.x - current.x;
      let directionZ = target.z - current.z;
      const distanceSquared = directionX * directionX + directionZ * directionZ;
      const distance = Math.sqrt(distanceSquared);
      const atIntersection = Math.min(Math.abs(current.x % ROAD_SPACING), Math.abs(current.z % ROAD_SPACING)) < 13;
      const vertical = Math.abs(directionZ) > Math.abs(directionX);
      const redLight = vertical ? cycle >= 8 : cycle < 8;
      const playerOffsetX = playerPosition.x - current.x;
      const playerOffsetZ = playerPosition.z - current.z;
      const playerDistanceSquared = playerOffsetX * playerOffsetX + playerOffsetZ * playerOffsetZ;
      const directionLength = Math.max(0.001, distance);
      const yielding = playerDistanceSquared < 100 &&
        (playerOffsetX * directionX + playerOffsetZ * directionZ) / (Math.sqrt(playerDistanceSquared) * directionLength) > 0.35;
      const desired = (redLight && atIntersection) || yielding ? 0 : car.cruise;
      car.speed = damp(car.speed, desired, desired === 0 ? 3.2 : 0.8, dt);
      const braking = desired < car.speed - 0.65;
      const visible = playerDistanceSquared <= this.renderDistanceSquared;
      car.model.visible = visible;
      if (visible) {
        this.visibleCars += 1;
        const detailed = playerDistanceSquared < 140 * 140;
        if (detailed !== car.detailed) {
          for (const detail of car.details) detail.visible = detailed;
          car.detailed = detailed;
        }
        if (car.braking !== braking) {
          for (const light of car.brakeLights) {
            light.emissive.setHex(braking ? 0xff1735 : 0x8d0618);
            light.emissiveIntensity = braking ? 3.4 : 1.5;
          }
        }
        car.wheelSpin += car.speed * dt / 0.3;
        for (const wheel of car.wheels) wheel.rotation.x = car.wheelSpin;
      }
      car.braking = braking;

      if (distance < 4.5) {
        car.segment = (car.segment + 1) % car.route.length;
      } else {
        directionX /= directionLength;
        directionZ /= directionLength;
        current.x += directionX * car.speed * dt;
        current.z += directionZ * car.speed * dt;
        const desiredYaw = Math.atan2(directionX, directionZ);
        car.model.rotation.y = this.dampAngle(car.model.rotation.y, desiredYaw, 6, dt);
      }

      car.body.position.set(current.x, current.y, current.z);
      car.body.quaternion.setFromEuler(0, car.model.rotation.y, 0);
      const velocityTarget = car.route[(car.segment + 1) % car.route.length];
      const velocityX = velocityTarget.x - current.x;
      const velocityZ = velocityTarget.z - current.z;
      const velocityLength = Math.max(0.001, Math.hypot(velocityX, velocityZ));
      car.body.velocity.set(velocityX / velocityLength * car.speed, 0, velocityZ / velocityLength * car.speed);
    }
  }

  get count(): number {
    return this.cars.length;
  }

  get visibleCount(): number {
    return this.visibleCars;
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
