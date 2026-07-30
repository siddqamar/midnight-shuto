import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import type { CameraMode, VehicleTelemetry } from '../core/types';
import { damp, speedEffectIntensity } from '../utils/math';

const MODES: CameraMode[] = ['CHASE', 'FAR', 'HOOD', 'DASH', 'COCKPIT', 'ORBIT', 'FREE'];

const offsets: Record<Exclude<CameraMode, 'ORBIT' | 'FREE'>, THREE.Vector3> = {
  CHASE: new THREE.Vector3(0, 3.25, -7.8),
  FAR: new THREE.Vector3(0, 6.1, -13.8),
  HOOD: new THREE.Vector3(0, 1.25, 1.22),
  DASH: new THREE.Vector3(0, 1.43, 0.35),
  COCKPIT: new THREE.Vector3(-0.42, 1.38, -0.18)
};

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private modeIndex = 0;
  private targetPosition = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private orbitAngle = 0;
  private freeYaw = 0;
  private freePitch = -0.12;
  private shakeTime = 0;
  private speedEffectLevel = 0;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private rayResult = new CANNON.RaycastResult();

  constructor(private target: THREE.Object3D, private physics: CANNON.World) {
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.08, 1500);
    this.camera.position.set(0, 4, -9);
    window.addEventListener('pointermove', (event) => {
      if (this.mode !== 'FREE' || document.pointerLockElement === null) return;
      this.freeYaw -= event.movementX * 0.002;
      this.freePitch = Math.max(-1.3, Math.min(1.1, this.freePitch - event.movementY * 0.002));
    });
  }

  get mode(): CameraMode {
    return MODES[this.modeIndex];
  }

  get feedbackIntensity(): number {
    return this.speedEffectLevel;
  }

  cycle(): CameraMode {
    this.modeIndex = (this.modeIndex + 1) % MODES.length;
    if (this.mode === 'FREE') {
      this.freeYaw = this.target.rotation.y;
      this.freePitch = -0.12;
    }
    return this.mode;
  }

  update(dt: number, telemetry: VehicleTelemetry): void {
    const mode = this.mode;
    this.speedEffectLevel = speedEffectIntensity(telemetry.speedKph);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.target.quaternion);
    const up = new THREE.Vector3(0, 1, 0);

    if (mode === 'ORBIT') {
      this.orbitAngle += dt * 0.22;
      this.targetPosition.copy(this.target.position).add(new THREE.Vector3(Math.sin(this.orbitAngle) * 10, 4.2, Math.cos(this.orbitAngle) * 10));
      this.lookTarget.copy(this.target.position).add(new THREE.Vector3(0, 1, 0));
    } else if (mode === 'FREE') {
      this.targetPosition.copy(this.target.position).add(new THREE.Vector3(0, 7, 0));
      const direction = new THREE.Vector3(
        Math.sin(this.freeYaw) * Math.cos(this.freePitch),
        Math.sin(this.freePitch),
        Math.cos(this.freeYaw) * Math.cos(this.freePitch)
      );
      this.lookTarget.copy(this.targetPosition).add(direction.multiplyScalar(20));
    } else {
      const localOffset = offsets[mode];
      this.targetPosition.copy(localOffset).applyQuaternion(this.target.quaternion).add(this.target.position);
      const lookDistance = mode === 'CHASE' || mode === 'FAR' ? 7 + telemetry.speedKph * 0.035 : 18;
      this.lookTarget.copy(this.target.position).add(forward.multiplyScalar(lookDistance)).add(up.multiplyScalar(mode === 'CHASE' ? 1.05 : 0.72));
      if (mode === 'CHASE' || mode === 'FAR') this.avoidObstructions();
    }

    const positionLambda = mode === 'HOOD' || mode === 'DASH' || mode === 'COCKPIT' ? 24 : 7.5;
    this.camera.position.lerp(this.targetPosition, 1 - Math.exp(-positionLambda * dt));
    if (mode !== 'ORBIT' && mode !== 'FREE' && !this.reducedMotion && this.speedEffectLevel > 0) {
      this.shakeTime += dt * (11 + this.speedEffectLevel * 9);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.target.quaternion);
      const amplitude = this.speedEffectLevel * (mode === 'CHASE' || mode === 'FAR' ? 0.045 : 0.012);
      this.camera.position.addScaledVector(right, Math.sin(this.shakeTime * 1.7) * amplitude);
      this.camera.position.addScaledVector(up, Math.cos(this.shakeTime * 2.3) * amplitude * 0.55);
    }
    const currentDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const desiredDirection = this.lookTarget.clone().sub(this.camera.position).normalize();
    currentDirection.lerp(desiredDirection, 1 - Math.exp(-10 * dt));
    this.camera.lookAt(this.camera.position.clone().add(currentDirection));
    const targetFov = mode === 'CHASE' || mode === 'FAR'
      ? 62 + Math.min(2, telemetry.speedKph * 0.025) + this.speedEffectLevel * 12
      : 67 + this.speedEffectLevel * 4;
    this.camera.fov = damp(this.camera.fov, targetFov, 4, dt);
    this.camera.updateProjectionMatrix();
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private avoidObstructions(): void {
    const origin = new CANNON.Vec3(this.target.position.x, this.target.position.y + 1.35, this.target.position.z);
    const destination = new CANNON.Vec3(this.targetPosition.x, this.targetPosition.y, this.targetPosition.z);
    this.rayResult.reset();
    const hit = this.physics.raycastClosest(
      origin,
      destination,
      { skipBackfaces: true, collisionFilterMask: 1 },
      this.rayResult
    );
    if (!hit) return;
    this.targetPosition.set(
      this.rayResult.hitPointWorld.x + this.rayResult.hitNormalWorld.x * 0.55,
      this.rayResult.hitPointWorld.y + this.rayResult.hitNormalWorld.y * 0.55,
      this.rayResult.hitPointWorld.z + this.rayResult.hitNormalWorld.z * 0.55
    );
  }
}
