import type { VehicleTelemetry, Weather } from '../core/types';
import { damp } from '../utils/math';

export class AudioSystem {
  private context?: AudioContext;
  private master?: GainNode;
  private engineGain?: GainNode;
  private engineOsc?: OscillatorNode;
  private engineHarmonic?: OscillatorNode;
  private noiseGain?: GainNode;
  private started = false;
  private currentFrequency = 60;

  async start(volume: number): Promise<void> {
    if (!this.context) this.createGraph(volume);
    await this.context?.resume();
    this.started = true;
  }

  setVolume(value: number): void {
    if (this.master && this.context) this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.08);
  }

  update(dt: number, telemetry: VehicleTelemetry, throttle: number, weather: Weather): void {
    if (!this.started || !this.context || !this.engineOsc || !this.engineHarmonic || !this.engineGain || !this.noiseGain) return;
    const target = 48 + telemetry.rpm * 0.035;
    this.currentFrequency = damp(this.currentFrequency, target, 9, dt);
    const now = this.context.currentTime;
    this.engineOsc.frequency.setTargetAtTime(this.currentFrequency, now, 0.03);
    this.engineHarmonic.frequency.setTargetAtTime(this.currentFrequency * 2.04, now, 0.035);
    this.engineGain.gain.setTargetAtTime(0.055 + throttle * 0.1 + telemetry.speedKph * 0.00035, now, 0.04);
    const tire = telemetry.drifting ? Math.min(0.19, telemetry.slip * 0.16) : weather === 'rain' ? 0.018 : 0.006;
    this.noiseGain.gain.setTargetAtTime(tire, now, 0.045);
  }

  collision(strength: number): void {
    if (!this.context || !this.master || !this.started) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(92 + strength * 55, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(38, this.context.currentTime + 0.16);
    gain.gain.setValueAtTime(strength * 0.22, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.18);
    oscillator.connect(gain).connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.2);
  }

  success(): void {
    if (!this.context || !this.master || !this.started) return;
    const now = this.context.currentTime;
    [392, 523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.085, now + index * 0.11 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.11 + 0.32);
      oscillator.connect(gain).connect(this.master!);
      oscillator.start(now + index * 0.11);
      oscillator.stop(now + index * 0.11 + 0.35);
    });
  }

  private createGraph(volume: number): void {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = volume;
    this.master.connect(this.context.destination);

    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0.001;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 780;
    filter.Q.value = 2.2;
    this.engineGain.connect(filter).connect(this.master);
    this.engineOsc = this.context.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineHarmonic = this.context.createOscillator();
    this.engineHarmonic.type = 'triangle';
    this.engineOsc.connect(this.engineGain);
    this.engineHarmonic.connect(this.engineGain);
    this.engineOsc.start();
    this.engineHarmonic.start();

    const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;
    const noise = this.context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    this.noiseGain = this.context.createGain();
    this.noiseGain.gain.value = 0.001;
    const noiseFilter = this.context.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 2400;
    noiseFilter.Q.value = 0.7;
    noise.connect(noiseFilter).connect(this.noiseGain).connect(this.master);
    noise.start();
  }
}
