import { VEHICLES } from './config';
import type { MissionRecord, SaveData } from './types';

const KEY = 'midnight-shuto-save-v1';

const createDefault = (): SaveData => ({
  version: 1,
  selectedVehicle: VEHICLES[0].id,
  vehicleColors: Object.fromEntries(VEHICLES.map((vehicle) => [vehicle.id, vehicle.color])),
  unlockedVehicles: [VEHICLES[0].id],
  credits: 0,
  missions: {},
  settings: { weather: 'sunset', difficulty: 'medium', quality: 'balanced', audio: 0.72 },
  stats: { distance: 0, topSpeed: 0, wins: 0, losses: 0, drifts: 0, playTime: 0, missionsCompleted: 0 }
});

export class SaveStore {
  data: SaveData;
  private elapsedSinceSave = 0;

  constructor() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) ?? '') as Partial<SaveData>;
      const defaults = createDefault();
      this.data = {
        ...defaults,
        ...parsed,
        settings: { ...defaults.settings, ...parsed.settings },
        stats: { ...defaults.stats, ...parsed.stats },
        missions: parsed.missions ?? {}
      };
    } catch {
      this.data = createDefault();
    }
  }

  tick(dt: number, speedKph: number): void {
    this.data.stats.playTime += dt;
    this.data.stats.distance += (speedKph / 3.6) * dt;
    this.data.stats.topSpeed = Math.max(this.data.stats.topSpeed, speedKph);
    this.elapsedSinceSave += dt;
    if (this.elapsedSinceSave > 10) this.save();
  }

  completeMission(id: string, record: MissionRecord, reward: number): void {
    const previous = this.data.missions[id] ?? {};
    this.data.missions[id] = {
      bestTime: record.bestTime === undefined ? previous.bestTime : Math.min(previous.bestTime ?? Infinity, record.bestTime),
      bestScore: Math.max(previous.bestScore ?? 0, record.bestScore ?? 0),
      medal: this.betterMedal(previous.medal, record.medal)
    };
    this.data.credits += reward;
    this.data.stats.wins += 1;
    this.data.stats.missionsCompleted += 1;
    for (const vehicle of VEHICLES) {
      if (vehicle.unlockWins <= this.data.stats.wins && !this.data.unlockedVehicles.includes(vehicle.id)) {
        this.data.unlockedVehicles.push(vehicle.id);
      }
    }
    this.save();
  }

  save(): void {
    this.elapsedSinceSave = 0;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // The game remains playable when storage is blocked.
    }
  }

  reset(): void {
    this.data = createDefault();
    this.save();
  }

  private betterMedal(a?: MissionRecord['medal'], b?: MissionRecord['medal']): MissionRecord['medal'] {
    const rank = { bronze: 1, silver: 2, gold: 3 };
    if (!a) return b;
    if (!b) return a;
    return rank[b] > rank[a] ? b : a;
  }
}
