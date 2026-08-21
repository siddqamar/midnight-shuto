import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { CameraRig } from '../camera/CameraRig';
import { AudioSystem } from '../audio/AudioSystem';
import { MISSIONS, VEHICLES } from './config';
import { Input } from './Input';
import { SaveStore } from './SaveStore';
import type { Difficulty, Weather } from './types';
import { MissionSystem } from '../missions/MissionSystem';
import { TrafficSystem } from '../traffic/TrafficSystem';
import { HUD } from '../ui/HUD';
import { PlayerVehicle } from '../vehicles/PlayerVehicle';
import { City } from '../world/City';

type GameState = 'menu' | 'playing' | 'paused';

export class Game {
  private scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer;
  private physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -18, 0) });
  private input = new Input();
  private save = new SaveStore();
  private hud: HUD;
  private city: City;
  private vehicle: PlayerVehicle;
  private camera: CameraRig;
  private traffic: TrafficSystem;
  private missions: MissionSystem;
  private audio = new AudioSystem();
  private state: GameState = 'menu';
  private previousTime = performance.now();
  private elapsed = 0;
  private fps = 60;
  private fpsElapsed = 0;
  private fpsFrames = 0;
  private lastInputThrottle = 0;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.shadowMap.enabled = this.save.data.settings.quality !== 'performance';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.setPixelRatio();
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.hud = new HUD(this.save.data);
    const viewport = document.querySelector('#viewport');
    if (!viewport) throw new Error('Missing viewport element.');
    viewport.appendChild(this.renderer.domElement);

    this.configurePhysics();
    this.city = new City(this.scene, this.physics, this.save.data.settings.quality);
    this.city.setWeather(this.save.data.settings.weather, this.scene);
    const spec = this.selectedSpec;
    this.audio.setPlayerProfile(spec.id);
    this.vehicle = new PlayerVehicle(this.physics, this.scene, spec, this.save.data.vehicleColors[spec.id] ?? spec.color);
    this.vehicle.reset(0, 0, 0);
    this.vehicle.setImpactHandler((strength) => this.audio.collision(strength));
    this.vehicle.body.collisionFilterGroup = 2;
    this.camera = new CameraRig(this.vehicle.group, this.physics);
    const trafficAmount = this.save.data.settings.quality === 'performance' ? 15 : this.save.data.settings.quality === 'high' ? 30 : 23;
    this.traffic = new TrafficSystem(this.scene, this.physics, trafficAmount);
    this.audio.setTrafficBudget(this.save.data.settings.quality === 'performance' ? 4 : this.save.data.settings.quality === 'high' ? 8 : 6);
    this.missions = new MissionSystem(this.scene, this.save.data.settings.difficulty);
    this.missions.onComplete((mission, record, won) => {
      if (won) {
        this.save.completeMission(mission.id, record, mission.reward);
        this.audio.success();
        this.hud.toast(`${record.medal?.toUpperCase() ?? 'FINISH'} - ${mission.reward.toLocaleString()} CR`, 'success');
      } else {
        this.save.data.stats.losses += 1;
        this.save.save();
        this.hud.toast('EVENT FAILED - TRY AGAIN', 'danger');
      }
      this.hud.refresh(this.save.data);
    });
    this.bindUI();
    this.bindInput();
    this.exposeDebugSnapshot();
    window.addEventListener('resize', this.resize);
    window.addEventListener('beforeunload', () => {
      this.save.save();
      this.audio.dispose();
    });
    this.renderer.setAnimationLoop(this.frame);
  }

  private get selectedSpec() {
    return VEHICLES.find((vehicle) => vehicle.id === this.save.data.selectedVehicle) ?? VEHICLES[0];
  }

  private configurePhysics(): void {
    this.physics.broadphase = new CANNON.SAPBroadphase(this.physics);
    this.physics.allowSleep = true;
    (this.physics.solver as CANNON.GSSolver).iterations = 7;
    const groundMaterial = new CANNON.Material({ friction: 0, restitution: 0.02 });
    const ground = new CANNON.Body({ mass: 0, material: groundMaterial });
    ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.physics.addBody(ground);
    this.physics.defaultContactMaterial.friction = 0;
    this.physics.defaultContactMaterial.restitution = 0.02;
  }

  private bindUI(): void {
    this.hud.bind({
      continue: () => this.startDriving(),
      newGame: () => {
        this.save.reset();
        this.applySelectedVehicle();
        this.vehicle.reset(0, 0, 0);
        this.hud.refresh(this.save.data);
        this.startDriving();
        this.hud.toast('NEW DRIVER PROFILE CREATED');
      },
      resume: () => this.togglePause(false),
      restart: () => {
        this.vehicle.recover();
        this.togglePause(false);
      },
      quitToMenu: () => {
        this.state = 'menu';
        this.audio.setDriving(false);
        this.missions.cancel();
        this.save.save();
        this.hud.showMainMenu();
      },
      selectVehicle: (id) => {
        if (!this.save.data.unlockedVehicles.includes(id)) return;
        this.save.data.selectedVehicle = id;
        this.applySelectedVehicle();
        this.save.save();
        this.hud.refresh(this.save.data);
      },
      setVehicleColor: (color) => {
        this.save.data.vehicleColors[this.save.data.selectedVehicle] = color;
        this.vehicle.setColor(color);
        this.save.save();
      },
      startMission: (id) => {
        const mission = MISSIONS.find((item) => item.id === id);
        if (!mission) return;
        this.vehicle.reset(mission.start[0], mission.start[1] - 8, 0);
        this.startDriving();
        this.missions.startById(id);
      },
      setWeather: (weather) => this.setWeather(weather),
      setDifficulty: (difficulty) => this.setDifficulty(difficulty),
      setQuality: (quality) => {
        this.save.data.settings.quality = quality;
        this.renderer.shadowMap.enabled = quality !== 'performance';
        this.setPixelRatio();
        this.save.save();
        this.hud.toast('GRAPHICS PROFILE APPLIED');
      },
      setAudio: (volume) => {
        this.save.data.settings.audio = volume;
        this.audio.setVolume(volume);
        this.save.save();
      }
    });
  }

  private bindInput(): void {
    const pause = () => {
      if (this.state === 'menu') return;
      this.togglePause(this.state === 'playing');
    };
    this.input.on('Escape', pause);
    this.input.on('KeyP', pause);
    this.input.on('KeyC', () => {
      if (this.state !== 'playing') return;
      const mode = this.camera.cycle();
      this.hud.toast(`${mode} CAMERA`);
      if (mode === 'FREE') this.renderer.domElement.requestPointerLock?.();
      else if (document.pointerLockElement) document.exitPointerLock();
    });
    this.input.on('KeyE', () => {
      if (this.state === 'playing') this.missions.tryStart(this.vehicle.group.position);
    });
    this.input.on('KeyM', () => {
      if (this.state === 'playing') this.hud.toggleMap();
    });
    this.input.on('KeyR', () => {
      if (this.state === 'playing') {
        this.vehicle.recover();
        this.hud.toast('VEHICLE RECOVERED');
      }
    });
    this.input.on('F3', () => this.hud.toggleDebug());
  }

  private startDriving(): void {
    this.state = 'playing';
    this.hud.hideMenu();
    void this.audio.start(this.save.data.settings.audio);
  }

  private togglePause(paused: boolean): void {
    this.state = paused ? 'paused' : 'playing';
    this.audio.setDriving(!paused);
    this.hud.showPause(paused);
    if (!paused) this.previousTime = performance.now();
  }

  private applySelectedVehicle(): void {
    const spec = this.selectedSpec;
    this.vehicle.setSpec(spec, this.save.data.vehicleColors[spec.id] ?? spec.color);
    this.audio.setPlayerProfile(spec.id);
  }

  private setWeather(weather: Weather): void {
    this.save.data.settings.weather = weather;
    this.city.setWeather(weather, this.scene);
    this.save.save();
    this.hud.toast(`${weather.toUpperCase()} WEATHER`);
  }

  private setDifficulty(difficulty: Difficulty): void {
    this.save.data.settings.difficulty = difficulty;
    this.missions.setDifficulty(difficulty);
    this.save.save();
  }

  private setPixelRatio(): void {
    const quality = this.save.data.settings.quality;
    const cap = quality === 'performance' ? 1 : quality === 'high' ? 2 : 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
  }

  private exposeDebugSnapshot(): void {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    const debugWindow = window as unknown as { __shutoDebug: () => unknown; __shutoReset: () => void };
    debugWindow.__shutoReset = () => this.vehicle.reset(0, 0, 0);
    debugWindow.__shutoDebug = () => {
      const telemetry = this.vehicle.getTelemetry();
      return {
        state: this.state,
        elapsed: this.elapsed,
        throttle: this.lastInputThrottle,
        telemetry: {
          speedKph: telemetry.speedKph,
          slip: telemetry.slip,
          drifting: telemetry.drifting
        },
        feedback: {
          cameraFov: this.camera.camera.fov,
          cameraIntensity: this.camera.feedbackIntensity,
          audioIntensity: this.audio.feedbackIntensity,
          soundscape: this.audio.getDebugSnapshot()
        },
        body: {
          type: this.vehicle.body.type,
          mass: this.vehicle.body.mass,
          position: { ...this.vehicle.body.position },
          velocity: { ...this.vehicle.body.velocity },
          angularVelocity: { ...this.vehicle.body.angularVelocity },
          quaternion: { ...this.vehicle.body.quaternion },
          force: { ...this.vehicle.body.force },
          sleeping: this.vehicle.body.sleepState
        },
        contacts: this.physics.contacts
          .filter((contact) => contact.bi === this.vehicle.body || contact.bj === this.vehicle.body)
          .map((contact) => ({
            other: contact.bi === this.vehicle.body ? contact.bj.id : contact.bi.id,
            normal: { ...contact.ni },
            otherPosition: contact.bi === this.vehicle.body ? { ...contact.bj.position } : { ...contact.bi.position }
          }))
      };
    };
  }

  private frame = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.previousTime) / 1000));
    this.previousTime = now;
    this.elapsed += dt;
    const controls = this.input.update(dt);
    this.lastInputThrottle = controls.throttle;

    if (this.state !== 'paused') {
      this.vehicle.prePhysics(dt, controls, this.state === 'playing');
      this.physics.step(1 / 60, dt, 3);
      this.vehicle.syncVisual(dt);
      this.traffic.update(dt, this.elapsed, this.vehicle.group.position);
    }

    const telemetry = this.vehicle.getTelemetry();
    const missionState = this.state === 'playing' ? this.missions.update(dt, telemetry) : {
      active: false,
      title: 'FREE DRIVE',
      objective: 'Explore Shuto City',
      timer: '',
      progress: '',
      score: 0,
      countdown: 0
    };
    this.camera.update(dt, telemetry);
    this.city.update(this.camera.camera.position, this.elapsed);
    if (this.state === 'playing') {
      this.hud.update(telemetry, missionState, this.camera.mode);
      this.audio.update(
        dt,
        telemetry,
        this.lastInputThrottle,
        this.save.data.settings.weather,
        this.camera.camera,
        this.traffic.audioVehicles
      );
      this.save.tick(dt, telemetry.speedKph);
    }

    this.renderer.render(this.scene, this.camera.camera);
    this.updatePerformance(dt, telemetry);
  };

  private updatePerformance(dt: number, telemetry: ReturnType<PlayerVehicle['getTelemetry']>): void {
    this.fpsElapsed += dt;
    this.fpsFrames += 1;
    if (this.fpsElapsed < 0.4) return;
    this.fps = this.fpsFrames / this.fpsElapsed;
    this.fpsElapsed = 0;
    this.fpsFrames = 0;
    this.hud.updateDebug(this.fps, this.renderer.info.render.calls, this.physics.bodies.length, telemetry, this.traffic.count);
  }

  private resize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.resize(window.innerWidth, window.innerHeight);
    this.setPixelRatio();
  };
}
