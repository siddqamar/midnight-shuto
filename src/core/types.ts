import type { Vector3 } from 'three';

export type Weather = 'sunny' | 'sunset' | 'night' | 'rain';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type CameraMode = 'CHASE' | 'FAR' | 'HOOD' | 'DASH' | 'ORBIT' | 'FREE';
export type MissionKind = 'sprint' | 'checkpoint' | 'drift';
export type VehicleId = 'kaze' | 'michi' | 'raiden' | 'shogun';

export interface VehicleSpec {
  id: VehicleId;
  name: string;
  className: string;
  description: string;
  color: string;
  accent: string;
  topSpeedKph: number;
  acceleration: number;
  handling: number;
  braking: number;
  grip: number;
  unlockWins: number;
}

export interface MissionDefinition {
  id: string;
  title: string;
  subtitle: string;
  kind: MissionKind;
  start: [number, number];
  checkpoints: Array<[number, number]>;
  timeLimit: number;
  targetScore?: number;
  medals: [number, number, number];
  reward: number;
}

export interface MissionRecord {
  bestTime?: number;
  bestScore?: number;
  medal?: 'bronze' | 'silver' | 'gold';
}

export interface SaveData {
  version: number;
  selectedVehicle: string;
  vehicleColors: Record<string, string>;
  unlockedVehicles: string[];
  credits: number;
  missions: Record<string, MissionRecord>;
  settings: {
    weather: Weather;
    difficulty: Difficulty;
    quality: 'performance' | 'balanced' | 'high';
    audio: number;
  };
  stats: {
    distance: number;
    topSpeed: number;
    wins: number;
    losses: number;
    drifts: number;
    playTime: number;
    missionsCompleted: number;
  };
}

export interface VehicleTelemetry {
  speedKph: number;
  rpm: number;
  gear: string;
  slip: number;
  drifting: boolean;
  position: Vector3;
  steering: number;
  throttle: number;
  brake: number;
}

export interface InputState {
  throttle: number;
  brake: number;
  steering: number;
  handbrake: boolean;
}
