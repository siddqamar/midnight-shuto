import type { VehicleId } from '../core/types';

export type TrafficVehicleKind = 'compact' | 'sedan' | 'touring';

export interface VehicleSoundProfile {
  idleHz: number;
  maximumHz: number;
  harmonicRatio: number;
  bodyRatio: number;
  engineGain: number;
  harmonicGain: number;
  bodyGain: number;
  mechanicalGain: number;
  roadGain: number;
  lowpassHz: number;
  roadCenterHz: number;
  roadQ: number;
  accelerationResponse: number;
  speedRangeKph: number;
  gearCount: number;
  harmonics: readonly number[];
}

export const PLAYER_SOUND_PROFILES: Record<VehicleId, VehicleSoundProfile> = {
  kaze: {
    idleHz: 58,
    maximumHz: 156,
    harmonicRatio: 2.03,
    bodyRatio: 0.5,
    engineGain: 0.082,
    harmonicGain: 0.033,
    bodyGain: 0.026,
    mechanicalGain: 0.012,
    roadGain: 0.052,
    lowpassHz: 2200,
    roadCenterHz: 1180,
    roadQ: 0.72,
    accelerationResponse: 1.15,
    speedRangeKph: 132,
    gearCount: 5,
    harmonics: [0, 1, 0.38, 0.22, 0.12, 0.06]
  },
  michi: {
    idleHz: 54,
    maximumHz: 142,
    harmonicRatio: 2.48,
    bodyRatio: 0.5,
    engineGain: 0.088,
    harmonicGain: 0.041,
    bodyGain: 0.031,
    mechanicalGain: 0.016,
    roadGain: 0.056,
    lowpassHz: 1950,
    roadCenterHz: 1050,
    roadQ: 0.68,
    accelerationResponse: 1.28,
    speedRangeKph: 154,
    gearCount: 6,
    harmonics: [0, 1, 0.29, 0.31, 0.15, 0.08]
  },
  raiden: {
    idleHz: 43,
    maximumHz: 118,
    harmonicRatio: 2.01,
    bodyRatio: 0.48,
    engineGain: 0.1,
    harmonicGain: 0.028,
    bodyGain: 0.049,
    mechanicalGain: 0.01,
    roadGain: 0.06,
    lowpassHz: 1580,
    roadCenterHz: 880,
    roadQ: 0.64,
    accelerationResponse: 0.96,
    speedRangeKph: 178,
    gearCount: 6,
    harmonics: [0, 1, 0.45, 0.16, 0.19, 0.04]
  },
  shogun: {
    idleHz: 50,
    maximumHz: 171,
    harmonicRatio: 3.02,
    bodyRatio: 0.5,
    engineGain: 0.092,
    harmonicGain: 0.044,
    bodyGain: 0.034,
    mechanicalGain: 0.014,
    roadGain: 0.063,
    lowpassHz: 2450,
    roadCenterHz: 1320,
    roadQ: 0.76,
    accelerationResponse: 1.36,
    speedRangeKph: 212,
    gearCount: 7,
    harmonics: [0, 1, 0.2, 0.36, 0.1, 0.14]
  }
};

export const TRAFFIC_SOUND_PROFILES: Record<TrafficVehicleKind, VehicleSoundProfile> = {
  compact: {
    idleHz: 56,
    maximumHz: 132,
    harmonicRatio: 2.05,
    bodyRatio: 0.5,
    engineGain: 0.064,
    harmonicGain: 0.025,
    bodyGain: 0.018,
    mechanicalGain: 0.007,
    roadGain: 0.042,
    lowpassHz: 1900,
    roadCenterHz: 1120,
    roadQ: 0.7,
    accelerationResponse: 1.14,
    speedRangeKph: 78,
    gearCount: 5,
    harmonics: [0, 1, 0.34, 0.25, 0.09, 0.05]
  },
  sedan: {
    idleHz: 47,
    maximumHz: 112,
    harmonicRatio: 2.02,
    bodyRatio: 0.48,
    engineGain: 0.071,
    harmonicGain: 0.021,
    bodyGain: 0.031,
    mechanicalGain: 0.006,
    roadGain: 0.048,
    lowpassHz: 1560,
    roadCenterHz: 940,
    roadQ: 0.63,
    accelerationResponse: 0.92,
    speedRangeKph: 82,
    gearCount: 6,
    harmonics: [0, 1, 0.43, 0.18, 0.15, 0.04]
  },
  touring: {
    idleHz: 41,
    maximumHz: 96,
    harmonicRatio: 1.52,
    bodyRatio: 0.47,
    engineGain: 0.082,
    harmonicGain: 0.018,
    bodyGain: 0.043,
    mechanicalGain: 0.008,
    roadGain: 0.056,
    lowpassHz: 1320,
    roadCenterHz: 790,
    roadQ: 0.58,
    accelerationResponse: 0.78,
    speedRangeKph: 86,
    gearCount: 6,
    harmonics: [0, 1, 0.51, 0.13, 0.2, 0.03]
  }
};
