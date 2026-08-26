import * as THREE from 'three';
import type { Weather } from '../core/types';

const INTENSITY: Record<Weather, number> = {
  sunny: 1.12,
  sunset: 0.96,
  night: 0.72,
  rain: 0.86
};

interface EnvPalette {
  zenith: string;
  sky: string;
  horizon: string;
  ground: string;
  sun: string;
  neon: string[];
}

const PALETTES: Record<Weather, EnvPalette> = {
  sunny: {
    zenith: '#c8e6ff',
    sky: '#7eb8e6',
    horizon: '#f2e4c4',
    ground: '#8a9278',
    sun: '#fff4c8',
    neon: ['#ffe7b0', '#d8ecff', '#fffaf0']
  },
  sunset: {
    zenith: '#1a1430',
    sky: '#3a2a48',
    horizon: '#ff7a3a',
    ground: '#3a2824',
    sun: '#ffb060',
    neon: ['#ff5a28', '#6a48ff', '#ffc878']
  },
  night: {
    zenith: '#05080f',
    sky: '#0c1422',
    horizon: '#1c2438',
    ground: '#121018',
    sun: '#d8e6ff',
    neon: ['#ff4d88', '#3de8ff', '#ffc24a', '#a78bff']
  },
  rain: {
    zenith: '#1a2430',
    sky: '#2a3848',
    horizon: '#4a6070',
    ground: '#1c2830',
    sun: '#e8f0f8',
    neon: ['#78b8ff', '#ffd078', '#b8fff0']
  }
};

const FACE_SIZE = 128;

function hexRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const u = Math.max(0, Math.min(1, t));
  const r = Math.round(a[0] + (b[0] - a[0]) * u);
  const g = Math.round(a[1] + (b[1] - a[1]) * u);
  const bch = Math.round(a[2] + (b[2] - a[2]) * u);
  return `rgb(${r},${g},${bch})`;
}

function paintFace(context: CanvasRenderingContext2D, face: number, palette: EnvPalette): void {
  const zenith = hexRgb(palette.zenith);
  const sky = hexRgb(palette.sky);
  const horizon = hexRgb(palette.horizon);
  const ground = hexRgb(palette.ground);
  const size = FACE_SIZE;

  for (let y = 0; y < size; y += 1) {
    const v = y / (size - 1);
    let color: string;
    if (face === 2) color = palette.zenith;
    else if (face === 3) color = palette.ground;
    else if (v < 0.46) color = mix(zenith, sky, v / 0.46);
    else if (v < 0.58) color = mix(sky, horizon, (v - 0.46) / 0.12);
    else color = mix(horizon, ground, Math.min(1, (v - 0.58) / 0.42));
    context.fillStyle = color;
    context.fillRect(0, y, size, 1);
  }

  if (face === 4 || face === 0) {
    context.fillStyle = palette.sun;
    context.beginPath();
    context.arc(face === 4 ? 86 : 40, 34, 16, 0, Math.PI * 2);
    context.fill();
  }

  if (face !== 2 && face !== 3) {
    for (let index = 0; index < 9; index += 1) {
      const x = 8 + ((index * 37 + face * 19) % (size - 16));
      const width = 3 + (index % 3);
      const top = 52 + (index % 4) * 4;
      const height = 18 + (index % 5) * 8;
      context.fillStyle = palette.neon[index % palette.neon.length];
      context.globalAlpha = 0.55 + (index % 3) * 0.12;
      context.fillRect(x, top, width, height);
    }
    context.globalAlpha = 1;
  }
}

function makeCubeTexture(weather: Weather): THREE.CubeTexture {
  const palette = PALETTES[weather];
  const images: HTMLCanvasElement[] = [];
  for (let face = 0; face < 6; face += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = FACE_SIZE;
    canvas.height = FACE_SIZE;
    const context = canvas.getContext('2d');
    if (context) paintFace(context, face, palette);
    images.push(canvas);
  }
  const cube = new THREE.CubeTexture();
  cube.images = images as unknown as HTMLImageElement[];
  cube.needsUpdate = true;
  cube.colorSpace = THREE.SRGBColorSpace;
  return cube;
}

export class CityEnvironment {
  texture: THREE.Texture;
  intensity: number;
  private readonly pmrem: THREE.PMREMGenerator;
  private weather: Weather;

  constructor(renderer: THREE.WebGLRenderer, weather: Weather) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileCubemapShader();
    this.weather = weather;
    this.intensity = INTENSITY[weather];
    this.texture = this.bake(weather);
  }

  setWeather(weather: Weather): void {
    if (weather === this.weather) return;
    this.weather = weather;
    this.intensity = INTENSITY[weather];
    const previous = this.texture;
    this.texture = this.bake(weather);
    previous.dispose();
  }

  dispose(): void {
    this.texture.dispose();
    this.pmrem.dispose();
  }

  private bake(weather: Weather): THREE.Texture {
    const cube = makeCubeTexture(weather);
    const renderTarget = this.pmrem.fromCubemap(cube);
    cube.dispose();
    return renderTarget.texture;
  }
}
