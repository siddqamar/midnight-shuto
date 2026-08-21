import * as THREE from 'three';
import { ROAD_SPACING, ROAD_WIDTH } from '../core/config';
import type { VehicleId, VehicleTelemetry, Weather } from '../core/types';
import { clamp, damp, speedEffectIntensity } from '../utils/math';
import {
  PLAYER_SOUND_PROFILES,
  TRAFFIC_SOUND_PROFILES,
  type TrafficVehicleKind,
  type VehicleSoundProfile
} from './vehicleSoundProfiles';

interface VectorLike {
  x: number;
  y: number;
  z: number;
}

export interface TrafficAudioVehicle {
  id: number;
  kind: TrafficVehicleKind;
  position: VectorLike;
  velocity: VectorLike;
  speedMps: number;
  acceleration: number;
  variation: number;
}

type TrafficLod = 'near' | 'mid' | 'far';

interface TrafficVoice {
  id: number;
  profile: VehicleSoundProfile;
  variation: number;
  fundamental: OscillatorNode;
  harmonic: OscillatorNode;
  body: OscillatorNode;
  engineGain: GainNode;
  harmonicGain: GainNode;
  bodyGain: GainNode;
  roadSource: AudioBufferSourceNode;
  roadFilter: BiquadFilterNode;
  roadGain: GainNode;
  panner: PannerNode;
  distanceFilter: BiquadFilterNode;
  output: GainNode;
  frequency: number;
}

const TRAFFIC_UPDATE_INTERVAL = 1 / 20;
const NEAR_DISTANCE = ROAD_WIDTH * 1.8;
const MID_DISTANCE = ROAD_SPACING * 0.9;
const FAR_DISTANCE = ROAD_SPACING * 2.25;
const FAR_DISTANCE_SQUARED = FAR_DISTANCE * FAR_DISTANCE;
const SPEED_OF_SOUND = 343;

export class AudioSystem {
  private context?: AudioContext;
  private master?: GainNode;
  private playerBus?: GainNode;
  private trafficBus?: GainNode;
  private engineGain?: GainNode;
  private harmonicGain?: GainNode;
  private bodyGain?: GainNode;
  private mechanicalGain?: GainNode;
  private engineFilter?: BiquadFilterNode;
  private engineOsc?: OscillatorNode;
  private engineHarmonic?: OscillatorNode;
  private engineBody?: OscillatorNode;
  private noiseBuffer?: AudioBuffer;
  private roadGain?: GainNode;
  private roadFilter?: BiquadFilterNode;
  private farTrafficGain?: GainNode;
  private farTrafficFilter?: BiquadFilterNode;
  private started = false;
  private driving = false;
  private playerProfileId: VehicleId = 'kaze';
  private playerProfile = PLAYER_SOUND_PROFILES.kaze;
  private currentFrequency = this.playerProfile.idleHz;
  private previousPlayerSpeed = 0;
  private speedEffectLevel = 0;
  private trafficAccumulator = 0;
  private trafficVoiceBudget = 6;
  private trafficVoices = new Map<number, TrafficVoice>();
  private candidateVehicles: TrafficAudioVehicle[] = [];
  private candidateDistances: number[] = [];
  private selectedTrafficIds = new Set<number>();
  private listenerPosition = new THREE.Vector3();
  private previousListenerPosition = new THREE.Vector3();
  private listenerVelocity = new THREE.Vector3();
  private listenerForward = new THREE.Vector3();
  private listenerUp = new THREE.Vector3();
  private listenerQuaternion = new THREE.Quaternion();
  private hasListenerPosition = false;
  private lodCounts: Record<TrafficLod, number> = { near: 0, mid: 0, far: 0 };

  get feedbackIntensity(): number {
    return this.speedEffectLevel;
  }

  setPlayerProfile(id: VehicleId): void {
    this.playerProfileId = id;
    this.playerProfile = PLAYER_SOUND_PROFILES[id];
    this.currentFrequency = this.playerProfile.idleHz;
    if (!this.context || !this.engineOsc || !this.engineHarmonic) return;
    this.engineOsc.setPeriodicWave(this.createEngineWave(this.playerProfile));
    this.engineHarmonic.setPeriodicWave(this.createEngineWave(this.playerProfile, 0.08));
  }

  setTrafficBudget(value: number): void {
    this.trafficVoiceBudget = Math.max(3, Math.min(8, Math.round(value)));
  }

  async start(volume: number): Promise<void> {
    if (!this.context) this.createGraph(volume);
    await this.context?.resume();
    this.started = this.context?.state === 'running';
    this.setDriving(true);
  }

  setDriving(value: boolean): void {
    this.driving = value;
    if (!this.context) return;
    const now = this.context.currentTime;
    this.playerBus?.gain.setTargetAtTime(value ? 1 : 0.0001, now, value ? 0.08 : 0.16);
    this.trafficBus?.gain.setTargetAtTime(value ? 1 : 0.0001, now, value ? 0.12 : 0.2);
  }

  setVolume(value: number): void {
    if (this.master && this.context) this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.08);
  }

  update(
    dt: number,
    telemetry: VehicleTelemetry,
    throttle: number,
    weather: Weather,
    listener: THREE.Object3D,
    traffic: readonly TrafficAudioVehicle[]
  ): void {
    this.speedEffectLevel = speedEffectIntensity(telemetry.speedKph);
    if (!this.started || !this.context || !this.driving) return;
    this.updateListener(dt, listener);
    this.updatePlayer(dt, telemetry, throttle, weather);
    this.trafficAccumulator += dt;
    if (this.trafficAccumulator < TRAFFIC_UPDATE_INTERVAL) return;
    const trafficDt = this.trafficAccumulator;
    this.trafficAccumulator = 0;
    this.updateTraffic(trafficDt, traffic);
  }

  collision(strength: number): void {
    if (!this.context || !this.master || !this.started) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(92 + strength * 55, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(38, this.context.currentTime + 0.16);
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    gain.gain.setValueAtTime(strength * 0.22, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.18);
    oscillator.connect(filter).connect(gain).connect(this.master);
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

  getDebugSnapshot(): object {
    return {
      contextState: this.context?.state ?? 'uninitialized',
      driving: this.driving,
      playerProfile: this.playerProfileId,
      playerFrequency: this.currentFrequency,
      activeTrafficVoices: this.trafficVoices.size,
      trafficLod: { ...this.lodCounts },
      trafficVoiceBudget: this.trafficVoiceBudget
    };
  }

  dispose(): void {
    for (const voice of this.trafficVoices.values()) this.destroyTrafficVoice(voice);
    this.trafficVoices.clear();
    void this.context?.close();
    this.context = undefined;
    this.started = false;
    this.hasListenerPosition = false;
  }

  private createGraph(volume: number): void {
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.context.createGain();
    this.master.gain.value = volume;
    this.master.connect(this.context.destination);
    this.playerBus = this.context.createGain();
    this.playerBus.gain.value = 0.0001;
    this.playerBus.connect(this.master);
    this.trafficBus = this.context.createGain();
    this.trafficBus.gain.value = 0.0001;
    this.trafficBus.connect(this.master);
    this.noiseBuffer = this.createRoadNoiseBuffer();

    this.engineFilter = this.context.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = this.playerProfile.lowpassHz;
    this.engineFilter.Q.value = 1.4;
    this.engineFilter.connect(this.playerBus);

    this.engineGain = this.context.createGain();
    this.harmonicGain = this.context.createGain();
    this.bodyGain = this.context.createGain();
    this.mechanicalGain = this.context.createGain();
    this.engineGain.gain.value = 0.001;
    this.harmonicGain.gain.value = 0.001;
    this.bodyGain.gain.value = 0.001;
    this.mechanicalGain.gain.value = 0.001;
    this.engineGain.connect(this.engineFilter);
    this.harmonicGain.connect(this.engineFilter);
    this.bodyGain.connect(this.engineFilter);
    this.mechanicalGain.connect(this.engineFilter);

    this.engineOsc = this.context.createOscillator();
    this.engineHarmonic = this.context.createOscillator();
    this.engineBody = this.context.createOscillator();
    this.engineOsc.setPeriodicWave(this.createEngineWave(this.playerProfile));
    this.engineHarmonic.setPeriodicWave(this.createEngineWave(this.playerProfile, 0.08));
    this.engineBody.type = 'triangle';
    this.engineOsc.connect(this.engineGain);
    this.engineHarmonic.connect(this.harmonicGain);
    this.engineBody.connect(this.bodyGain);
    this.engineOsc.start();
    this.engineHarmonic.start();
    this.engineBody.start();

    const mechanicalSource = this.createLoopingNoiseSource();
    const mechanicalFilter = this.context.createBiquadFilter();
    mechanicalFilter.type = 'bandpass';
    mechanicalFilter.frequency.value = 720;
    mechanicalFilter.Q.value = 1.8;
    mechanicalSource.connect(mechanicalFilter).connect(this.mechanicalGain);
    mechanicalSource.start();

    const roadSource = this.createLoopingNoiseSource();
    this.roadGain = this.context.createGain();
    this.roadFilter = this.context.createBiquadFilter();
    this.roadGain.gain.value = 0.001;
    this.roadFilter.type = 'bandpass';
    roadSource.connect(this.roadFilter).connect(this.roadGain).connect(this.playerBus);
    roadSource.start();

    const farTrafficSource = this.createLoopingNoiseSource();
    this.farTrafficGain = this.context.createGain();
    this.farTrafficFilter = this.context.createBiquadFilter();
    this.farTrafficGain.gain.value = 0.0001;
    this.farTrafficFilter.type = 'bandpass';
    this.farTrafficFilter.frequency.value = 480;
    this.farTrafficFilter.Q.value = 0.55;
    farTrafficSource.connect(this.farTrafficFilter).connect(this.farTrafficGain).connect(this.trafficBus);
    farTrafficSource.start();
  }

  private updatePlayer(dt: number, telemetry: VehicleTelemetry, throttle: number, weather: Weather): void {
    if (!this.context || !this.engineOsc || !this.engineHarmonic || !this.engineBody || !this.engineGain ||
      !this.harmonicGain || !this.bodyGain || !this.mechanicalGain || !this.engineFilter || !this.roadGain || !this.roadFilter) return;
    const profile = this.playerProfile;
    const rpmLevel = clamp((telemetry.rpm - 900) / 7600, 0, 1);
    const acceleration = (telemetry.speedKph - this.previousPlayerSpeed) / Math.max(dt, 0.001);
    this.previousPlayerSpeed = telemetry.speedKph;
    const load = clamp(throttle * 0.72 + Math.max(0, acceleration) * 0.018, 0, 1);
    const overrun = clamp(Math.max(0, -acceleration) * 0.012, 0, 0.22);
    const target = profile.idleHz + (profile.maximumHz - profile.idleHz) * (0.12 + rpmLevel * 0.88);
    this.currentFrequency = damp(this.currentFrequency, target, 7.5 * profile.accelerationResponse, dt);
    const now = this.context.currentTime;
    this.engineOsc.frequency.setTargetAtTime(this.currentFrequency, now, 0.035);
    this.engineHarmonic.frequency.setTargetAtTime(this.currentFrequency * profile.harmonicRatio, now, 0.04);
    this.engineBody.frequency.setTargetAtTime(this.currentFrequency * profile.bodyRatio, now, 0.05);
    const engineEnergy = 0.42 + rpmLevel * 0.25 + load * 0.58 - overrun;
    this.engineGain.gain.setTargetAtTime(profile.engineGain * engineEnergy, now, 0.045);
    this.harmonicGain.gain.setTargetAtTime(profile.harmonicGain * (0.22 + rpmLevel * 0.34 + load * 0.82), now, 0.05);
    this.bodyGain.gain.setTargetAtTime(profile.bodyGain * (0.65 + load * 0.35), now, 0.06);
    this.mechanicalGain.gain.setTargetAtTime(profile.mechanicalGain * (0.2 + rpmLevel * 0.65 + load * 0.4), now, 0.07);
    this.engineFilter.frequency.setTargetAtTime(profile.lowpassHz * (0.52 + rpmLevel * 0.48) + load * 620, now, 0.07);

    const roadLevel = clamp((telemetry.speedKph - 18) / Math.max(1, profile.speedRangeKph - 18), 0, 1);
    const tire = telemetry.drifting ? Math.min(0.15, telemetry.slip * 0.14) : weather === 'rain' ? 0.012 * roadLevel : 0;
    const wind = this.speedEffectLevel * 0.052;
    this.roadGain.gain.setTargetAtTime(profile.roadGain * roadLevel * roadLevel + tire + wind, now, 0.07);
    this.roadFilter.frequency.setTargetAtTime(profile.roadCenterHz + roadLevel * 1250, now, 0.1);
    this.roadFilter.Q.setTargetAtTime(profile.roadQ, now, 0.1);
  }

  private updateListener(dt: number, listener: THREE.Object3D): void {
    if (!this.context) return;
    listener.getWorldPosition(this.listenerPosition);
    listener.getWorldQuaternion(this.listenerQuaternion);
    this.listenerForward.set(0, 0, -1).applyQuaternion(this.listenerQuaternion).normalize();
    this.listenerUp.set(0, 1, 0).applyQuaternion(this.listenerQuaternion).normalize();
    if (this.hasListenerPosition) {
      this.listenerVelocity.copy(this.listenerPosition).sub(this.previousListenerPosition).multiplyScalar(1 / Math.max(dt, 0.001));
      if (this.listenerVelocity.lengthSq() > 8100) this.listenerVelocity.setLength(90);
    } else {
      this.listenerVelocity.set(0, 0, 0);
      this.hasListenerPosition = true;
    }
    this.previousListenerPosition.copy(this.listenerPosition);
    const now = this.context.currentTime;
    const audioListener = this.context.listener;
    audioListener.positionX.setTargetAtTime(this.listenerPosition.x, now, 0.025);
    audioListener.positionY.setTargetAtTime(this.listenerPosition.y, now, 0.025);
    audioListener.positionZ.setTargetAtTime(this.listenerPosition.z, now, 0.025);
    audioListener.forwardX.setTargetAtTime(this.listenerForward.x, now, 0.025);
    audioListener.forwardY.setTargetAtTime(this.listenerForward.y, now, 0.025);
    audioListener.forwardZ.setTargetAtTime(this.listenerForward.z, now, 0.025);
    audioListener.upX.setTargetAtTime(this.listenerUp.x, now, 0.025);
    audioListener.upY.setTargetAtTime(this.listenerUp.y, now, 0.025);
    audioListener.upZ.setTargetAtTime(this.listenerUp.z, now, 0.025);
  }

  private updateTraffic(dt: number, traffic: readonly TrafficAudioVehicle[]): void {
    if (!this.context || !this.trafficBus) return;
    this.findClosestTraffic(traffic);
    this.selectedTrafficIds.clear();
    this.lodCounts.near = 0;
    this.lodCounts.mid = 0;
    this.lodCounts.far = 0;
    let farCount = 0;
    let farSpeed = 0;

    for (let index = 0; index < traffic.length; index += 1) {
      const source = traffic[index];
      const distanceSquared = this.distanceSquaredToListener(source.position);
      if (distanceSquared > MID_DISTANCE * MID_DISTANCE && distanceSquared <= FAR_DISTANCE_SQUARED) {
        farCount += 1;
        farSpeed += source.speedMps;
      }
    }

    for (let index = 0; index < this.candidateVehicles.length; index += 1) {
      const source = this.candidateVehicles[index];
      const distance = Math.sqrt(this.candidateDistances[index]);
      this.selectedTrafficIds.add(source.id);
      let voice = this.trafficVoices.get(source.id);
      if (!voice) {
        voice = this.createTrafficVoice(source);
        this.trafficVoices.set(source.id, voice);
      }
      const lod: TrafficLod = distance <= NEAR_DISTANCE ? 'near' : distance <= MID_DISTANCE ? 'mid' : 'far';
      this.lodCounts[lod] += 1;
      this.updateTrafficVoice(voice, source, lod, distance, dt);
    }

    for (const [id, voice] of this.trafficVoices) {
      if (this.selectedTrafficIds.has(id)) continue;
      this.destroyTrafficVoice(voice);
      this.trafficVoices.delete(id);
    }

    if (this.farTrafficGain && this.farTrafficFilter) {
      const now = this.context.currentTime;
      const averageSpeed = farCount > 0 ? farSpeed / farCount : 0;
      const ambience = Math.min(0.035, farCount * 0.0035) * clamp(averageSpeed / 14, 0.25, 1);
      this.farTrafficGain.gain.setTargetAtTime(ambience, now, 0.35);
      this.farTrafficFilter.frequency.setTargetAtTime(360 + averageSpeed * 22, now, 0.35);
    }
  }

  private findClosestTraffic(traffic: readonly TrafficAudioVehicle[]): void {
    this.candidateVehicles.length = 0;
    this.candidateDistances.length = 0;
    for (let sourceIndex = 0; sourceIndex < traffic.length; sourceIndex += 1) {
      const source = traffic[sourceIndex];
      const distanceSquared = this.distanceSquaredToListener(source.position);
      if (distanceSquared > FAR_DISTANCE_SQUARED) continue;
      let insertAt = this.candidateDistances.length;
      while (insertAt > 0 && this.candidateDistances[insertAt - 1] > distanceSquared) insertAt -= 1;
      if (insertAt >= this.trafficVoiceBudget) continue;
      const nextLength = Math.min(this.trafficVoiceBudget, this.candidateDistances.length + 1);
      for (let shift = nextLength - 1; shift > insertAt; shift -= 1) {
        this.candidateDistances[shift] = this.candidateDistances[shift - 1];
        this.candidateVehicles[shift] = this.candidateVehicles[shift - 1];
      }
      this.candidateDistances[insertAt] = distanceSquared;
      this.candidateVehicles[insertAt] = source;
      this.candidateDistances.length = nextLength;
      this.candidateVehicles.length = nextLength;
    }
  }

  private createTrafficVoice(source: TrafficAudioVehicle): TrafficVoice {
    if (!this.context || !this.trafficBus) throw new Error('Traffic audio graph is not ready.');
    const profile = TRAFFIC_SOUND_PROFILES[source.kind];
    const fundamental = this.context.createOscillator();
    const harmonic = this.context.createOscillator();
    const body = this.context.createOscillator();
    fundamental.setPeriodicWave(this.createEngineWave(profile, source.variation));
    harmonic.setPeriodicWave(this.createEngineWave(profile, source.variation + 0.07));
    body.type = 'triangle';
    const engineGain = this.context.createGain();
    const harmonicGain = this.context.createGain();
    const bodyGain = this.context.createGain();
    engineGain.gain.value = 0.0001;
    harmonicGain.gain.value = 0.0001;
    bodyGain.gain.value = 0.0001;
    fundamental.connect(engineGain);
    harmonic.connect(harmonicGain);
    body.connect(bodyGain);

    const roadSource = this.createLoopingNoiseSource();
    const roadFilter = this.context.createBiquadFilter();
    const roadGain = this.context.createGain();
    roadFilter.type = 'bandpass';
    roadFilter.frequency.value = profile.roadCenterHz;
    roadFilter.Q.value = profile.roadQ;
    roadGain.gain.value = 0.0001;
    roadSource.connect(roadFilter).connect(roadGain);

    const panner = this.context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 11;
    panner.maxDistance = FAR_DISTANCE * 1.1;
    panner.rolloffFactor = 0.72;
    const distanceFilter = this.context.createBiquadFilter();
    distanceFilter.type = 'lowpass';
    distanceFilter.frequency.value = profile.lowpassHz;
    distanceFilter.Q.value = 0.55;
    const output = this.context.createGain();
    output.gain.value = 0.0001;
    engineGain.connect(panner);
    harmonicGain.connect(panner);
    bodyGain.connect(panner);
    roadGain.connect(panner);
    panner.connect(distanceFilter).connect(output).connect(this.trafficBus);
    fundamental.start();
    harmonic.start();
    body.start();
    roadSource.start();
    return {
      id: source.id,
      profile,
      variation: source.variation,
      fundamental,
      harmonic,
      body,
      engineGain,
      harmonicGain,
      bodyGain,
      roadSource,
      roadFilter,
      roadGain,
      panner,
      distanceFilter,
      output,
      frequency: profile.idleHz * (1 + source.variation)
    };
  }

  private updateTrafficVoice(
    voice: TrafficVoice,
    source: TrafficAudioVehicle,
    lod: TrafficLod,
    distance: number,
    dt: number
  ): void {
    if (!this.context) return;
    const profile = voice.profile;
    const speedKph = source.speedMps * 3.6;
    const speedLevel = clamp(speedKph / profile.speedRangeKph, 0, 1);
    const gearPosition = speedLevel * profile.gearCount;
    const gearPhase = gearPosition - Math.floor(gearPosition);
    const rpmLevel = speedLevel < 0.04 ? speedLevel * 4 : 0.26 + gearPhase * 0.7;
    const load = clamp(0.2 + Math.max(0, source.acceleration) * 0.22 - Math.max(0, -source.acceleration) * 0.06, 0.08, 1);
    const baseFrequency = profile.idleHz + (profile.maximumHz - profile.idleHz) * rpmLevel;
    voice.frequency = damp(voice.frequency, baseFrequency * (1 + voice.variation), 4.8 * profile.accelerationResponse, dt);

    const dx = source.position.x - this.listenerPosition.x;
    const dy = source.position.y - this.listenerPosition.y;
    const dz = source.position.z - this.listenerPosition.z;
    const inverseDistance = distance > 0.001 ? 1 / distance : 0;
    const relativeX = source.velocity.x - this.listenerVelocity.x;
    const relativeY = source.velocity.y - this.listenerVelocity.y;
    const relativeZ = source.velocity.z - this.listenerVelocity.z;
    const radialVelocity = (relativeX * dx + relativeY * dy + relativeZ * dz) * inverseDistance;
    const doppler = clamp(SPEED_OF_SOUND / (SPEED_OF_SOUND + radialVelocity), 0.96, 1.04);
    const now = this.context.currentTime;
    voice.fundamental.frequency.setTargetAtTime(voice.frequency * doppler, now, 0.055);
    voice.harmonic.frequency.setTargetAtTime(voice.frequency * profile.harmonicRatio * doppler, now, 0.06);
    voice.body.frequency.setTargetAtTime(voice.frequency * profile.bodyRatio * doppler, now, 0.07);
    voice.roadSource.playbackRate.setTargetAtTime(clamp((0.72 + speedLevel * 0.58) * doppler, 0.6, 1.45), now, 0.09);
    voice.panner.positionX.setTargetAtTime(source.position.x, now, 0.045);
    voice.panner.positionY.setTargetAtTime(source.position.y, now, 0.045);
    voice.panner.positionZ.setTargetAtTime(source.position.z, now, 0.045);
    voice.panner.panningModel = lod === 'near' ? 'HRTF' : 'equalpower';

    const variationGain = 1 + voice.variation * 1.8;
    const lodGain = lod === 'near' ? 1 : lod === 'mid' ? 0.62 : 0.24;
    const detailGain = lod === 'near' ? 1 : lod === 'mid' ? 0.28 : 0.0001;
    const roadDetail = lod === 'near' ? 1 : lod === 'mid' ? 0.38 : 0.0001;
    const energy = 0.4 + speedLevel * 0.28 + load * 0.45;
    voice.engineGain.gain.setTargetAtTime(profile.engineGain * energy * variationGain, now, 0.08);
    voice.harmonicGain.gain.setTargetAtTime(profile.harmonicGain * detailGain * (0.25 + load * 0.75), now, 0.1);
    voice.bodyGain.gain.setTargetAtTime(profile.bodyGain * (lod === 'far' ? 0.12 : 0.55 + load * 0.3), now, 0.11);
    voice.roadGain.gain.setTargetAtTime(profile.roadGain * roadDetail * speedLevel * speedLevel, now, 0.12);
    voice.roadFilter.frequency.setTargetAtTime(profile.roadCenterHz + speedLevel * 760, now, 0.14);
    const cutoff = lod === 'near' ? profile.lowpassHz * 1.15 : lod === 'mid' ? profile.lowpassHz * 0.72 : 620;
    voice.distanceFilter.frequency.setTargetAtTime(cutoff, now, 0.16);
    const edgeFade = lod === 'far' ? clamp((FAR_DISTANCE - distance) / (FAR_DISTANCE - MID_DISTANCE), 0, 1) : 1;
    voice.output.gain.setTargetAtTime(lodGain * edgeFade, now, 0.14);
  }

  private destroyTrafficVoice(voice: TrafficVoice): void {
    voice.output.gain.value = 0.0001;
    voice.fundamental.stop();
    voice.harmonic.stop();
    voice.body.stop();
    voice.roadSource.stop();
    voice.output.disconnect();
  }

  private distanceSquaredToListener(position: VectorLike): number {
    const dx = position.x - this.listenerPosition.x;
    const dy = position.y - this.listenerPosition.y;
    const dz = position.z - this.listenerPosition.z;
    return dx * dx + dy * dy + dz * dz;
  }

  private createEngineWave(profile: VehicleSoundProfile, variation = 0): PeriodicWave {
    if (!this.context) throw new Error('Audio context is not ready.');
    const real = new Float32Array(profile.harmonics.length);
    const imaginary = new Float32Array(profile.harmonics.length);
    for (let index = 1; index < profile.harmonics.length; index += 1) {
      const unevenness = 1 + Math.sin(index * 12.9898 + variation * 91.7) * Math.abs(variation) * 1.8;
      imaginary[index] = profile.harmonics[index] * unevenness;
      real[index] = profile.harmonics[index] * 0.08 * Math.sin(index * 2.3 + variation);
    }
    return this.context.createPeriodicWave(real, imaginary, { disableNormalization: false });
  }

  private createRoadNoiseBuffer(): AudioBuffer {
    if (!this.context) throw new Error('Audio context is not ready.');
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 3, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    let low = 0;
    let previous = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const white = Math.random() * 2 - 1;
      low = low * 0.985 + white * 0.12;
      const textured = low * 0.72 + (white - previous) * 0.13;
      channel[index] = clamp(textured, -1, 1);
      previous = white;
    }
    return buffer;
  }

  private createLoopingNoiseSource(): AudioBufferSourceNode {
    if (!this.context || !this.noiseBuffer) throw new Error('Noise buffer is not ready.');
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.loopStart = 0.17;
    source.loopEnd = this.noiseBuffer.duration - 0.19;
    return source;
  }
}
