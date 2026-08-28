import * as THREE from 'three';
import type { VehicleId, VehicleTelemetry } from '../core/types';

export class InstrumentCluster {
  readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private lastGear = '';
  private lastSpeed = -1;
  private lastRpm = -1;

  constructor(
    private readonly mesh: THREE.Mesh,
    private readonly vehicleId: VehicleId
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 256;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Instrument cluster canvas is unavailable.');
    this.context = context;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    material.name = 'Cluster';
    this.mesh.material = material;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.draw({
      speedKph: 0,
      rpm: 900,
      gear: 'N',
      slip: 0,
      drifting: false,
      position: new THREE.Vector3(),
      steering: 0,
      throttle: 0,
      brake: 0
    });
  }

  update(telemetry: VehicleTelemetry): void {
    const speed = Math.round(telemetry.speedKph);
    const rpm = Math.round(telemetry.rpm / 40) * 40;
    if (speed === this.lastSpeed && rpm === this.lastRpm && telemetry.gear === this.lastGear) return;
    this.lastSpeed = speed;
    this.lastRpm = rpm;
    this.lastGear = telemetry.gear;
    this.draw(telemetry);
    this.texture.needsUpdate = true;
  }

  private draw(telemetry: VehicleTelemetry): void {
    const ctx = this.context;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    if (this.vehicleId === 'shogun') this.drawDigital(ctx, width, height, telemetry);
    else this.drawAnalog(ctx, width, height, telemetry);
  }

  private drawAnalog(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    telemetry: VehicleTelemetry
  ): void {
    ctx.fillStyle = '#07090d';
    ctx.fillRect(0, 0, width, height);

    const accent = this.vehicleId === 'michi' ? '#f0c14a' : this.vehicleId === 'raiden' ? '#d7b17a' : '#ff4a63';
    this.gauge(ctx, 150, 132, 108, telemetry.speedKph / 240, 0, 240, 'km/h', accent, false);
    this.gauge(ctx, 362, 132, 108, telemetry.rpm / 8500, 0, 9, 'rpm x1000', accent, true);

    ctx.fillStyle = '#0b1118';
    ctx.fillRect(230, 168, 52, 46);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(230, 168, 52, 46);
    ctx.fillStyle = '#f4f7f8';
    ctx.font = '700 28px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(telemetry.gear, 256, 192);

    ctx.fillStyle = 'rgba(244,247,248,0.72)';
    ctx.font = '600 18px "Arial Narrow", Arial, sans-serif';
    ctx.fillText(String(Math.round(telemetry.speedKph)).padStart(3, '0'), 256, 44);
  }

  private drawDigital(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    telemetry: VehicleTelemetry
  ): void {
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createLinearGradient(0, 0, width, 0);
    glow.addColorStop(0, 'rgba(245, 206, 79, 0.08)');
    glow.addColorStop(0.5, 'rgba(77, 233, 255, 0.16)');
    glow.addColorStop(1, 'rgba(245, 206, 79, 0.08)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#f5ce4f';
    ctx.font = '700 92px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(telemetry.speedKph)).padStart(3, '0'), 256, 108);
    ctx.fillStyle = 'rgba(244,247,248,0.55)';
    ctx.font = '600 18px "Arial Narrow", Arial, sans-serif';
    ctx.fillText('KM/H', 256, 158);

    ctx.fillStyle = '#4de9ff';
    ctx.font = '700 36px "Arial Narrow", Arial, sans-serif';
    ctx.fillText(telemetry.gear, 70, 48);

    const rpm = Math.min(1, telemetry.rpm / 8500);
    ctx.fillStyle = '#141820';
    ctx.fillRect(48, 198, 416, 22);
    ctx.fillStyle = rpm > 0.88 ? '#ff3f77' : '#4de9ff';
    ctx.fillRect(48, 198, 416 * rpm, 22);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.strokeRect(48, 198, 416, 22);
  }

  private gauge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    amount: number,
    min: number,
    max: number,
    label: string,
    accent: string,
    redline: boolean
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#10151c';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1d2630';
    ctx.stroke();

    const start = Math.PI * 0.75;
    const span = Math.PI * 1.5;
    const ticks = 12;
    for (let i = 0; i <= ticks; i += 1) {
      const t = i / ticks;
      const angle = start + span * t;
      const inner = i % 2 === 0 ? radius - 18 : radius - 12;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * (radius - 6), Math.sin(angle) * (radius - 6));
      ctx.strokeStyle = redline && t > 0.82 ? '#ff3f77' : 'rgba(244,247,248,0.78)';
      ctx.lineWidth = i % 2 === 0 ? 3 : 1.5;
      ctx.stroke();
      if (i % 2 === 0) {
        const value = Math.round(min + (max - min) * t);
        ctx.fillStyle = 'rgba(244,247,248,0.8)';
        ctx.font = '600 13px "Arial Narrow", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(value), Math.cos(angle) * (radius - 32), Math.sin(angle) * (radius - 32));
      }
    }

    ctx.fillStyle = 'rgba(244,247,248,0.45)';
    ctx.font = '600 12px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, radius * 0.42);

    const needle = start + span * Math.max(0, Math.min(1, amount));
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(needle + Math.PI) * 14, Math.sin(needle + Math.PI) * 14);
    ctx.lineTo(Math.cos(needle) * (radius - 22), Math.sin(needle) * (radius - 22));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();
  }
}
