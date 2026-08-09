export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount;

export const damp = (from: number, to: number, lambda: number, dt: number): number => lerp(from, to, 1 - Math.exp(-lambda * dt));

export const speedEffectIntensity = (speedKph: number): number => {
  const progress = clamp((speedKph - 80) / 100, 0, 1);
  return progress * progress * (3 - 2 * progress);
};

export const formatTime = (seconds: number): string => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`;
};

export const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};
