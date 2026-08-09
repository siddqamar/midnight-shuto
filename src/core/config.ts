import type { MissionDefinition, VehicleSpec } from './types';

export const WORLD_SIZE = 1440;
export const ROAD_SPACING = 120;
export const ROAD_WIDTH = 28;

export const VEHICLES: VehicleSpec[] = [
  {
    id: 'kaze',
    name: 'Kaze 86',
    className: 'SPORT COMPACT',
    description: 'Light, eager, and happiest sideways.',
    color: '#c92832',
    accent: '#111827',
    topSpeedKph: 132,
    acceleration: 6,
    handling: 2.65,
    braking: 0.94,
    grip: 0.84,
    unlockWins: 0
  },
  {
    id: 'michi',
    name: 'Michi RS',
    className: 'TURBO HATCH',
    description: 'Short wheelbase and instant city pace.',
    color: '#1765c1',
    accent: '#161b26',
    topSpeedKph: 154,
    acceleration: 7,
    handling: 2.85,
    braking: 0.93,
    grip: 0.87,
    unlockWins: 1
  },
  {
    id: 'raiden',
    name: 'Raiden GT',
    className: 'GRAND TOURER',
    description: 'Stable at speed with deep reserves of power.',
    color: '#174b32',
    accent: '#0c1220',
    topSpeedKph: 178,
    acceleration: 8.3,
    handling: 2.35,
    braking: 0.95,
    grip: 0.89,
    unlockWins: 3
  },
  {
    id: 'shogun',
    name: 'Shogun X',
    className: 'SUPERCAR',
    description: 'Uncompromising speed for proven drivers.',
    color: '#f1b800',
    accent: '#16100b',
    topSpeedKph: 212,
    acceleration: 10,
    handling: 2.5,
    braking: 0.96,
    grip: 0.91,
    unlockWins: 6
  }
];

export const MISSIONS: MissionDefinition[] = [
  {
    id: 'bayline-sprint',
    title: 'Bayline Rush',
    subtitle: 'Sprint - Docks to downtown',
    kind: 'sprint',
    start: [480, 480],
    checkpoints: [[360, 480], [240, 360], [120, 360], [0, 240], [-120, 120], [-240, 0]],
    timeLimit: 76,
    medals: [72, 61, 53],
    reward: 1800
  },
  {
    id: 'neon-thread',
    title: 'Neon Thread',
    subtitle: 'Checkpoint - Thread the city',
    kind: 'checkpoint',
    start: [-480, 360],
    checkpoints: [[-360, 360], [-240, 240], [-240, 120], [-120, 0], [0, -120], [120, -120], [240, -240], [360, -360]],
    timeLimit: 98,
    medals: [92, 78, 66],
    reward: 2200
  },
  {
    id: 'harbor-slide',
    title: 'Harbor Slide',
    subtitle: 'Drift - Own the waterfront',
    kind: 'drift',
    start: [480, -360],
    checkpoints: [[480, -480], [360, -480], [240, -360], [360, -240], [480, -240], [600, -360]],
    timeLimit: 72,
    targetScore: 12000,
    medals: [5000, 8500, 12000],
    reward: 2500
  }
];
