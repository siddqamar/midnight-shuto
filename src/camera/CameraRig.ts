import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import type { CameraMode, VehicleTelemetry } from '../core/types';
import { clamp, damp, speedEffectIntensity } from '../utils/math';

const MODES: CameraMode[] = ['CHASE', 'FAR', 'HOOD', 'DASH', 'ORBIT', 'FREE'];

const offsets: Record<Exclude<CameraMode, 'ORBIT' | 'FREE'>, THREE.Vector3> = {
  CHASE: new THREE.Vector3(0, 3.25, -7.8),
  FAR: new THREE.Vector3(0, 6.1, -13.8),
  HOOD: new THREE.Vector3(0, 1.12, 1.28),
  DASH: new THREE.Vector3(0, 1.18, 0.22)
};

const SOCKETS: Partial<Record<CameraMode, { camera: string; look: string }>> = {
  HOOD: { camera: 'cam_hood', look: 'cam_hood_look' },
  DASH: { camera: 'cam_dash', look: 'cam_dash_look' }
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
  private lastSpeed = 0;
  private pitchSway = 0;
  private lookSway = 0;
  private worldUp = new THREE.Vector3(0, 1, 0);
  private scratchForward = new THREE.Vector3();
  private scratchRight = new THREE.Vector3();
  private scratchLook = new THREE.Vector3();
  private socketPosition = new THREE.Vector3();
  private socketLook = new THREE.Vector3();

  private rayResult = new CANNON.RaycastResult();

  constructor(private target: THREE.Object3D, private physics: CANNON.World) {
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 1500);
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
    this.scratchForward.set(0, 0, 1).applyQuaternion(this.target.quaternion);
    this.scratchRight.set(1, 0, 0).applyQuaternion(this.target.quaternion);
    const mounted = mode === 'HOOD' || mode === 'DASH';
    const interior = mode === 'DASH';

    const accel = clamp((telemetry.speedKph - this.lastSpeed) / Math.max(dt, 0.001) / 80, -1, 1);
    this.lastSpeed = telemetry.speedKph;
    this.pitchSway = damp(this.pitchSway, telemetry.throttle * 0.035 - telemetry.brake * 0.05 - accel * 0.03, 6, dt);
    this.lookSway = damp(this.lookSway, telemetry.steering * (interior ? 1.8 : 0.4), 5, dt);

    if (mode === 'ORBIT') {
      this.orbitAngle += dt * 0.22;
      this.targetPosition.copy(this.target.position).add(new THREE.Vector3(Math.sin(this.orbitAngle) * 7.2, 2.7, Math.cos(this.orbitAngle) * 7.2));
      this.lookTarget.copy(this.target.position).add(new THREE.Vector3(0, 0.82, 0));
    } else if (mode === 'FREE') {
      this.targetPosition.copy(this.target.position).add(new THREE.Vector3(0, 7, 0));
      const direction = new THREE.Vector3(
        Math.sin(this.freeYaw) * Math.cos(this.freePitch),
        Math.sin(this.freePitch),
        Math.cos(this.freeYaw) * Math.cos(this.freePitch)
      );
      this.lookTarget.copy(this.targetPosition).add(direction.multiplyScalar(20));
    } else if (!this.applySocket(mode)) {
      const localOffset = offsets[mode];
      this.targetPosition.copy(localOffset).applyQuaternion(this.target.quaternion).add(this.target.position);
      const lookDistance = mode === 'CHASE' || mode === 'FAR' ? 7 + telemetry.speedKph * 0.035 : 14;
      const lookHeight = mode === 'CHASE' ? 1.05 : interior ? 0.92 : 0.72;
      this.lookTarget.copy(this.target.position).add(this.scratchForward.clone().multiplyScalar(lookDistance)).add(this.worldUp.clone().multiplyScalar(lookHeight));
      if (mode === 'CHASE' || mode === 'FAR') this.avoidObstructions();
    }

    if (mounted) {
      this.targetPosition.addScaledVector(this.scratchRight, this.lookSway * 0.012);
      this.targetPosition.addScaledVector(this.worldUp, this.pitchSway * 0.35);
      this.lookTarget.addScaledVector(this.scratchRight, this.lookSway);
      this.lookTarget.addScaledVector(this.worldUp, this.pitchSway * 4);
    }

    const positionLambda = interior ? 42 : mode === 'HOOD' ? 28 : 7.5;
    this.camera.position.lerp(this.targetPosition, 1 - Math.exp(-positionLambda * dt));
    if (mode !== 'ORBIT' && mode !== 'FREE' && !this.reducedMotion) {
      this.shakeTime += dt * (8 + telemetry.rpm / 900 + this.speedEffectLevel * 9);
      const idleVibe = interior ? 0.0018 + telemetry.rpm * 0.0000007 : 0;
      const amplitude = idleVibe + this.speedEffectLevel * (mode === 'CHASE' || mode === 'FAR' ? 0.045 : 0.007);
      this.camera.position.addScaledVector(this.scratchRight, Math.sin(this.shakeTime * 1.7) * amplitude);
      this.camera.position.addScaledVector(this.worldUp, Math.cos(this.shakeTime * 2.3) * amplitude * 0.55);
    }
    const currentDirection = this.scratchLook.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const desiredDirection = this.lookTarget.clone().sub(this.camera.position).normalize();
    const lookLambda = interior ? 16 : 10;
    currentDirection.lerp(desiredDirection, 1 - Math.exp(-lookLambda * dt));
    this.camera.lookAt(this.camera.position.clone().add(currentDirection));

    const targetFov = mode === 'CHASE' || mode === 'FAR'
      ? 62 + Math.min(2, telemetry.speedKph * 0.025) + this.speedEffectLevel * 12
      : mode === 'DASH'
        ? 66 + this.speedEffectLevel * 3.5
        : 70 + this.speedEffectLevel * 4;
    this.camera.fov = damp(this.camera.fov, targetFov, 4, dt);
    this.camera.near = interior ? 0.04 : 0.08;
    this.camera.updateProjectionMatrix();
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private applySocket(mode: CameraMode): boolean {
    const names = SOCKETS[mode];
    if (!names) return false;
    const cameraNode = this.target.getObjectByName(names.camera);
    const lookNode = this.target.getObjectByName(names.look);
    if (!cameraNode || !lookNode) return false;
    cameraNode.getWorldPosition(this.socketPosition);
    lookNode.getWorldPosition(this.socketLook);
    this.targetPosition.copy(this.socketPosition);
    this.lookTarget.copy(this.socketLook);
    return true;
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
