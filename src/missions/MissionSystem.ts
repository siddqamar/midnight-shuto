import * as THREE from 'three';
import { MISSIONS } from '../core/config';
import type { Difficulty, MissionDefinition, MissionRecord, VehicleTelemetry } from '../core/types';
import { formatTime } from '../utils/math';
import { createCarModel } from '../vehicles/CarModel';

export interface MissionHUDState {
  active: boolean;
  title: string;
  objective: string;
  timer: string;
  progress: string;
  score: number;
  countdown: number;
  prompt?: string;
}

interface Opponent {
  model: THREE.Group;
  route: THREE.Vector3[];
  segment: number;
  distance: number;
  speed: number;
  finished: boolean;
}

export class MissionSystem {
  private markers = new Map<string, THREE.Group>();
  private checkpoint: THREE.Group;
  private active?: MissionDefinition;
  private phase: 'idle' | 'countdown' | 'running' | 'results' = 'idle';
  private elapsed = 0;
  private countdown = 0;
  private checkpointIndex = 0;
  private score = 0;
  private combo = 1;
  private resultTimer = 0;
  private opponents: Opponent[] = [];
  private difficulty: Difficulty;
  private completeHandler?: (mission: MissionDefinition, record: MissionRecord, won: boolean) => void;

  constructor(private scene: THREE.Scene, difficulty: Difficulty) {
    this.difficulty = difficulty;
    for (const mission of MISSIONS) {
      const marker = this.createStartMarker(mission);
      marker.position.set(mission.start[0], 0.08, mission.start[1]);
      scene.add(marker);
      this.markers.set(mission.id, marker);
    }
    this.checkpoint = this.createCheckpoint();
    this.checkpoint.visible = false;
    scene.add(this.checkpoint);
  }

  onComplete(callback: (mission: MissionDefinition, record: MissionRecord, won: boolean) => void): void {
    this.completeHandler = callback;
  }

  setDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
  }

  tryStart(position: THREE.Vector3): boolean {
    if (this.phase !== 'idle') return false;
    const nearest = this.findNearest(position);
    if (!nearest || nearest.distance > 20) return false;
    this.start(nearest.mission);
    return true;
  }

  startById(id: string): void {
    const mission = MISSIONS.find((item) => item.id === id);
    if (mission && this.phase === 'idle') this.start(mission);
  }

  update(dt: number, telemetry: VehicleTelemetry): MissionHUDState {
    const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.13;
    this.markers.forEach((marker) => {
      marker.rotation.y += dt * 0.45;
      marker.scale.setScalar(pulse);
    });
    if (this.checkpoint.visible) this.checkpoint.rotation.z += dt * 0.25;

    if (this.phase === 'idle') {
      const nearest = this.findNearest(telemetry.position);
      return {
        active: false,
        title: 'FREE DRIVE',
        objective: 'Explore Shuto City',
        timer: '',
        progress: '',
        score: 0,
        countdown: 0,
        prompt: nearest && nearest.distance < 20 ? `E  START ${nearest.mission.title.toUpperCase()}` : undefined
      };
    }

    if (!this.active) return this.emptyState();
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.phase = 'running';
      return this.makeState(Math.max(1, Math.ceil(this.countdown)));
    }

    if (this.phase === 'results') {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) this.resetMission();
      return this.makeState(0);
    }

    this.elapsed += dt;
    this.updateOpponents(dt);
    if (telemetry.drifting) {
      this.combo = Math.min(5, this.combo + dt * 0.55);
      this.score += telemetry.speedKph * telemetry.slip * this.combo * dt * 5.2;
    } else {
      this.combo = Math.max(1, this.combo - dt * 1.8);
    }

    if (this.active.kind === 'drift') {
      this.updateCheckpointProgress(telemetry.position, true);
      if (this.elapsed >= this.active.timeLimit) this.finish(this.score >= this.active.medals[0]);
    } else {
      this.updateCheckpointProgress(telemetry.position, false);
      if (this.elapsed >= this.active.timeLimit) this.finish(false);
    }
    return this.makeState(0);
  }

  cancel(): void {
    if (this.phase !== 'idle') this.resetMission();
  }

  get activeMission(): MissionDefinition | undefined {
    return this.active;
  }

  private start(mission: MissionDefinition): void {
    this.active = mission;
    this.phase = 'countdown';
    this.countdown = 3;
    this.elapsed = 0;
    this.checkpointIndex = 0;
    this.score = 0;
    this.combo = 1;
    this.markers.forEach((marker) => { marker.visible = false; });
    this.positionCheckpoint();
    if (mission.kind !== 'drift') this.spawnOpponents(mission);
  }

  private updateCheckpointProgress(position: THREE.Vector3, loop: boolean): void {
    if (!this.active) return;
    const target = this.active.checkpoints[this.checkpointIndex];
    if (!target) return;
    if (Math.hypot(position.x - target[0], position.z - target[1]) > 14) return;
    this.checkpointIndex += 1;
    if (this.checkpointIndex >= this.active.checkpoints.length) {
      if (loop) this.checkpointIndex = 0;
      else {
        const opponentsDone = this.opponents.filter((opponent) => opponent.finished).length;
        this.finish(opponentsDone === 0);
        return;
      }
    }
    this.positionCheckpoint();
  }

  private finish(won: boolean): void {
    if (!this.active || this.phase !== 'running') return;
    const medal = won ? this.calculateMedal() : undefined;
    const record: MissionRecord = this.active.kind === 'drift'
      ? { bestScore: Math.round(this.score), medal }
      : { bestTime: this.elapsed, medal };
    this.completeHandler?.(this.active, record, won);
    this.phase = 'results';
    this.resultTimer = 4.5;
    this.checkpoint.visible = false;
    this.removeOpponents();
  }

  private calculateMedal(): MissionRecord['medal'] {
    if (!this.active) return undefined;
    const [bronze, silver, gold] = this.active.medals;
    const value = this.active.kind === 'drift' ? this.score : this.elapsed;
    if (this.active.kind === 'drift') {
      if (value >= gold) return 'gold';
      if (value >= silver) return 'silver';
      if (value >= bronze) return 'bronze';
    } else {
      if (value <= gold) return 'gold';
      if (value <= silver) return 'silver';
      if (value <= bronze) return 'bronze';
    }
    return undefined;
  }

  private resetMission(): void {
    this.active = undefined;
    this.phase = 'idle';
    this.checkpoint.visible = false;
    this.removeOpponents();
    this.markers.forEach((marker) => { marker.visible = true; });
  }

  private positionCheckpoint(): void {
    if (!this.active) return;
    const point = this.active.checkpoints[this.checkpointIndex];
    if (!point) return;
    this.checkpoint.position.set(point[0], 7.5, point[1]);
    this.checkpoint.visible = true;
  }

  private makeState(countdown: number): MissionHUDState {
    if (!this.active) return this.emptyState();
    const running = this.phase === 'running';
    const remaining = Math.max(0, this.active.timeLimit - this.elapsed);
    const objective = this.phase === 'results'
      ? 'RUN COMPLETE'
      : this.active.kind === 'drift'
        ? `Drift target ${this.active.targetScore?.toLocaleString()}`
        : 'Reach every checkpoint';
    return {
      active: true,
      title: this.active.title,
      objective,
      timer: running || this.phase === 'results' ? formatTime(remaining) : '',
      progress: this.active.kind === 'drift'
        ? `x${this.combo.toFixed(1)} COMBO`
        : `${Math.min(this.checkpointIndex + 1, this.active.checkpoints.length)} / ${this.active.checkpoints.length}`,
      score: Math.round(this.score),
      countdown
    };
  }

  private emptyState(): MissionHUDState {
    return { active: false, title: '', objective: '', timer: '', progress: '', score: 0, countdown: 0 };
  }

  private findNearest(position: THREE.Vector3): { mission: MissionDefinition; distance: number } | undefined {
    let nearest: { mission: MissionDefinition; distance: number } | undefined;
    for (const mission of MISSIONS) {
      const distance = Math.hypot(position.x - mission.start[0], position.z - mission.start[1]);
      if (!nearest || distance < nearest.distance) nearest = { mission, distance };
    }
    return nearest;
  }

  private createStartMarker(mission: MissionDefinition): THREE.Group {
    const group = new THREE.Group();
    const color = mission.kind === 'drift' ? 0xff4ea1 : mission.kind === 'sprint' ? 0x50e6ff : 0xffd35a;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(5.2, 0.22, 8, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78, toneMapped: false })
    );
    ring.rotation.x = Math.PI / 2;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 4.8, 18, 22, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.y = 9;
    group.add(ring, beam);
    return group;
  }

  private createCheckpoint(): THREE.Group {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(7.1, 0.35, 10, 48),
      new THREE.MeshBasicMaterial({ color: 0x54efff, transparent: true, opacity: 0.88, toneMapped: false })
    );
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(7.1, 0.82, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0x2aa9ff, transparent: true, opacity: 0.12, depthWrite: false })
    );
    group.add(ring, glow);
    return group;
  }

  private spawnOpponents(mission: MissionDefinition): void {
    const start = new THREE.Vector3(mission.start[0], 0.58, mission.start[1]);
    const route = [start, ...mission.checkpoints.map(([x, z]) => new THREE.Vector3(x, 0.58, z))];
    const base = this.difficulty === 'easy' ? 18 : this.difficulty === 'hard' ? 25 : 21.5;
    for (let index = 0; index < 3; index += 1) {
      const vehicleId = index === 0 ? 'kaze' : index === 1 ? 'michi' : 'raiden';
      const model = createCarModel(vehicleId, ['#ee355f', '#8e5dff', '#48dd9b'][index], '#10131a');
      model.scale.setScalar(0.92);
      model.position.copy(start).add(new THREE.Vector3((index - 1) * 3.2, 0, -4 - index * 2.5));
      this.scene.add(model);
      this.opponents.push({ model, route, segment: 0, distance: 0, speed: base + index * 0.7, finished: false });
    }
  }

  private updateOpponents(dt: number): void {
    for (const opponent of this.opponents) {
      if (opponent.finished) continue;
      const target = opponent.route[opponent.segment + 1];
      if (!target) {
        opponent.finished = true;
        continue;
      }
      const direction = target.clone().sub(opponent.model.position);
      if (direction.length() < 3.2) {
        opponent.segment += 1;
        continue;
      }
      direction.normalize();
      const avoidance = this.opponents.reduce((offset, other) => {
        if (other === opponent || other.model.position.distanceTo(opponent.model.position) > 5) return offset;
        return offset + (opponent.model.id > other.model.id ? 0.8 : -0.8);
      }, 0);
      opponent.model.position.addScaledVector(direction, opponent.speed * dt);
      opponent.model.position.x += avoidance * dt;
      opponent.distance += opponent.speed * dt;
      opponent.model.rotation.y = Math.atan2(direction.x, direction.z);
      opponent.model.userData.wheels?.forEach((wheel: THREE.Group) => { wheel.rotation.x += opponent.speed * dt / 0.38; });
    }
  }

  private removeOpponents(): void {
    for (const opponent of this.opponents) this.scene.remove(opponent.model);
    this.opponents = [];
  }
}
