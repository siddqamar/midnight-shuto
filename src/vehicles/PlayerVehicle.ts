import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import type { CameraMode, InputState, VehicleSpec, VehicleTelemetry } from '../core/types';
import { clamp, damp } from '../utils/math';
import { createCarModel, type CarModel } from './CarModel';

export class PlayerVehicle {
  readonly body: CANNON.Body;
  readonly group: THREE.Group;
  private model: CarModel;
  private spec: VehicleSpec;
  private wheelSpin = 0;
  private steeringVisual = 0;
  private lastInput: InputState = { throttle: 0, brake: 0, steering: 0, handbrake: false };
  private speedForward = 0;
  private slip = 0;
  private onImpact?: (strength: number) => void;
  private forwardAxis = new CANNON.Vec3(0, 0, 1);
  private rightAxis = new CANNON.Vec3(1, 0, 0);
  private localForward = new CANNON.Vec3();
  private localRight = new CANNON.Vec3();
  private impulse = new CANNON.Vec3();
  private steeringAxis = new THREE.Vector3(0, 0, 1);
  private cameraMode?: CameraMode;

  constructor(world: CANNON.World, scene: THREE.Scene, spec: VehicleSpec, color: string) {
    this.spec = spec;
    this.group = new THREE.Group();
    this.model = createCarModel(spec.id, color, spec.accent);
    this.group.add(this.model);
    scene.add(this.group);

    this.body = new CANNON.Body({
      mass: 1180,
      shape: new CANNON.Box(new CANNON.Vec3(
        this.model.userData.collisionHalfExtents.x,
        this.model.userData.collisionHalfExtents.y,
        this.model.userData.collisionHalfExtents.z
      )),
      position: new CANNON.Vec3(0, 0.62, 0),
      linearDamping: 0.025,
      angularDamping: 0.78,
      material: new CANNON.Material({ friction: 0, restitution: 0.05 })
    });
    this.body.angularFactor.set(0, 1, 0);
    this.body.allowSleep = false;
    this.body.addEventListener('collide', (event: { contact: CANNON.ContactEquation }) => {
      const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
      if (impact > 2.8) this.onImpact?.(clamp(impact / 20, 0, 1));
    });
    world.addBody(this.body);
    this.reset(0, 0, 0);
  }

  setImpactHandler(callback: (strength: number) => void): void {
    this.onImpact = callback;
  }

  setSpec(spec: VehicleSpec, color: string): void {
    this.spec = spec;
    this.group.remove(this.model);
    this.model = createCarModel(spec.id, color, spec.accent);
    this.group.add(this.model);
    const previousShape = this.body.shapes[0];
    if (previousShape) this.body.removeShape(previousShape);
    const halfExtents = this.model.userData.collisionHalfExtents;
    this.body.addShape(new CANNON.Box(new CANNON.Vec3(halfExtents.x, halfExtents.y, halfExtents.z)));
    this.body.updateMassProperties();
    this.body.updateBoundingRadius();
  }

  setColor(color: string): void {
    const paints = this.model.userData.bodyMaterials ?? [this.model.userData.bodyMaterial];
    for (const material of paints) {
      material.color.set(color);
      if (material instanceof THREE.MeshPhysicalMaterial) {
        material.sheenColor.set(color).multiplyScalar(1.12);
      }
    }
  }

  prePhysics(dt: number, input: InputState, enabled: boolean): void {
    this.lastInput = enabled ? input : { throttle: 0, brake: 0, steering: 0, handbrake: true };
    const localForward = this.body.quaternion.vmult(this.forwardAxis, this.localForward);
    const localRight = this.body.quaternion.vmult(this.rightAxis, this.localRight);
    const velocity = this.body.velocity;
    this.speedForward = velocity.dot(localForward);
    const lateralSpeed = velocity.dot(localRight);
    this.slip = Math.abs(lateralSpeed) / Math.max(3, Math.abs(this.speedForward));

    const targetSpeed = this.spec.topSpeedKph / 3.6;
    const normalizedSpeed = clamp(Math.abs(this.speedForward) / targetSpeed, 0, 1);
    const movingForward = this.speedForward > 1.5;
    const movingBackward = this.speedForward < -1.5;
    let drive = 0;

    if (this.lastInput.throttle > 0 && !movingBackward) drive += this.lastInput.throttle;
    else if (this.lastInput.throttle > 0) this.applyLongitudinalBrake(0.9 * this.lastInput.throttle, dt);
    if (this.lastInput.brake > 0 && !movingForward) drive -= this.lastInput.brake * 0.58;
    else if (this.lastInput.brake > 0) this.applyLongitudinalBrake(this.spec.braking * this.lastInput.brake, dt);

    const reverseSpeed = 48 / 3.6;
    const speedLimiter = drive > 0
      ? clamp((1 - normalizedSpeed) * 4, 0, 1)
      : clamp(1 - Math.pow(Math.abs(this.speedForward) / reverseSpeed, 2), 0, 1);
    localForward.scale(drive * this.spec.acceleration * this.body.mass * speedLimiter * dt, this.impulse);
    this.body.applyImpulse(this.impulse);

    const grip = this.lastInput.handbrake ? 0.18 : this.spec.grip;
    const lateralCorrection = lateralSpeed * clamp(grip * dt * 8.5, 0, 0.92);
    velocity.x -= localRight.x * lateralCorrection;
    velocity.z -= localRight.z * lateralCorrection;

    const steerAuthority = clamp(Math.abs(this.speedForward) / 5, 0, 1) * (1 - normalizedSpeed * 0.68);
    const reverseSign = this.speedForward < -0.8 ? -1 : 1;
    const driftBoost = this.lastInput.handbrake && Math.abs(this.speedForward) > 8 ? 1.32 : 1;
    const targetYaw = this.lastInput.steering * this.spec.handling * steerAuthority * reverseSign * driftBoost;
    this.body.angularVelocity.y = damp(this.body.angularVelocity.y, targetYaw, this.lastInput.handbrake ? 3.5 : 7.5, dt);

    const aeroDrag = 0.00002 * velocity.lengthSquared();
    velocity.x -= velocity.x * aeroDrag * dt;
    velocity.z -= velocity.z * aeroDrag * dt;

    if (this.body.position.y < -2 || Math.abs(this.body.position.x) > 760 || Math.abs(this.body.position.z) > 760) this.recover();
  }

  syncVisual(dt: number): void {
    const position = this.body.interpolatedPosition;
    const quaternion = this.body.interpolatedQuaternion;
    this.group.position.set(position.x, position.y - 0.42, position.z);
    this.group.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    this.wheelSpin += this.speedForward * dt / 0.38;
    this.steeringVisual = damp(this.steeringVisual, this.lastInput.steering * 0.5, 10, dt);
    // Wheel order from GLB: fl, fr, rl, rr — front axles are indices 0 and 1.
    this.model.userData.wheels.forEach((wheel, index) => {
      wheel.rotation.x = this.wheelSpin;
      if (index === 0 || index === 1) wheel.rotation.y = this.steeringVisual;
    });
    const brakeIntensity = this.lastInput.brake > 0.05 ? 0xff8a96 : 0xff2a42;
    this.model.userData.brakeLights.forEach((light) => {
      const material = light.material as THREE.MeshStandardMaterial;
      material.color.setHex(brakeIntensity);
      material.emissive.setHex(this.lastInput.brake > 0.05 ? 0xff2448 : 0xa0081c);
      material.emissiveIntensity = this.lastInput.brake > 0.05 ? 3.6 : 2.0;
    });
    const wheel = this.model.userData.steeringWheel;
    if (wheel) {
      wheel.quaternion.copy(this.model.userData.steeringBase);
      wheel.rotateOnAxis(this.steeringAxis, this.steeringVisual * 2.6);
    }
    this.model.userData.cluster?.update(this.getTelemetry());
  }

  setCameraMode(mode: CameraMode): void {
    if (mode === this.cameraMode) return;
    this.cameraMode = mode;
    const interior = mode === 'DASH';
    for (const glass of this.model.userData.cabinGlass) glass.visible = !interior;
    const light = this.model.userData.interiorLight;
    if (light) light.intensity = interior ? 1.8 : 0.7;
  }

  getWheelWorldPositions(): Array<{ x: number; y: number; z: number }> {
    return this.model.userData.wheels.map((wheel) => {
      const position = wheel.getWorldPosition(new THREE.Vector3());
      return { x: position.x, y: position.y, z: position.z };
    });
  }

  getTelemetry(): VehicleTelemetry {
    const speedKph = Math.abs(this.speedForward) * 3.6;
    const gearNumber = speedKph < 3 ? 'N' : String(clamp(Math.ceil(speedKph / 38), 1, 6));
    const gear = this.speedForward < -1.5 ? 'R' : gearNumber;
    const band = gear === 'N' || gear === 'R' ? speedKph / 40 : (speedKph % 38) / 38;
    return {
      speedKph,
      rpm: clamp(1100 + band * 6900 + this.lastInput.throttle * 700, 900, 8500),
      gear,
      slip: this.slip,
      drifting: this.slip > 0.22 && speedKph > 24,
      position: this.group.position,
      steering: this.lastInput.steering,
      throttle: this.lastInput.throttle,
      brake: this.lastInput.brake
    };
  }

  reset(x: number, z: number, yaw: number): void {
    this.body.position.set(x, 0.75, z);
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
    this.body.quaternion.setFromEuler(0, yaw, 0);
    this.body.previousPosition.copy(this.body.position);
    this.body.interpolatedPosition.copy(this.body.position);
    this.body.previousQuaternion.copy(this.body.quaternion);
    this.body.interpolatedQuaternion.copy(this.body.quaternion);
    this.body.wakeUp();
  }

  recover(): void {
    const x = clamp(Math.round(this.body.position.x / 120) * 120, -600, 600);
    const z = clamp(Math.round(this.body.position.z / 120) * 120, -600, 600);
    const rotation = new CANNON.Vec3();
    this.body.quaternion.toEuler(rotation);
    let yaw = rotation.y;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const facingOutward = (x >= 600 && forwardX > 0) ||
      (x <= -600 && forwardX < 0) ||
      (z >= 600 && forwardZ > 0) ||
      (z <= -600 && forwardZ < 0);
    if (facingOutward) yaw += Math.PI;
    this.reset(x, z, yaw);
  }

  private applyLongitudinalBrake(strength: number, dt: number): void {
    const forward = this.body.quaternion.vmult(this.forwardAxis, this.localForward);
    const forwardSpeed = this.body.velocity.dot(forward);
    const deltaSpeed = Math.min(Math.abs(forwardSpeed), strength * 14.5 * dt);
    const direction = Math.sign(forwardSpeed);
    this.body.velocity.x -= forward.x * deltaSpeed * direction;
    this.body.velocity.z -= forward.z * deltaSpeed * direction;
  }
}
