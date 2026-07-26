import { MISSIONS, VEHICLES, WORLD_SIZE } from '../core/config';
import type { CameraMode, Difficulty, SaveData, VehicleTelemetry, Weather } from '../core/types';
import type { MissionHUDState } from '../missions/MissionSystem';

export interface UIHandlers {
  continue: () => void;
  newGame: () => void;
  resume: () => void;
  restart: () => void;
  quitToMenu: () => void;
  selectVehicle: (id: string) => void;
  setVehicleColor: (color: string) => void;
  startMission: (id: string) => void;
  setWeather: (weather: Weather) => void;
  setDifficulty: (difficulty: Difficulty) => void;
  setQuality: (quality: SaveData['settings']['quality']) => void;
  setAudio: (volume: number) => void;
}

export class HUD {
  private root: HTMLElement;
  private mapCanvas: HTMLCanvasElement;
  private mapContext: CanvasRenderingContext2D;
  private speedElement: HTMLElement;
  private rpmElement: HTMLElement;
  private gearElement: HTMLElement;
  private missionPanel: HTMLElement;
  private promptElement: HTMLElement;
  private countdownElement: HTMLElement;
  private debugElement: HTMLElement;
  private cameraElement: HTMLElement;
  private toastElement: HTMLElement;
  private lastSpeed = -1;
  private toastTimeout = 0;
  private mapExpanded = false;
  private debugVisible = false;

  constructor(private save: SaveData) {
    const app = document.querySelector<HTMLElement>('#app');
    if (!app) throw new Error('Missing #app mount point.');
    app.innerHTML = this.template();
    this.root = app;
    this.mapCanvas = this.require<HTMLCanvasElement>('#minimap-canvas');
    const context = this.mapCanvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    this.mapContext = context;
    this.speedElement = this.require('#speed-value');
    this.rpmElement = this.require('#rpm-bar');
    this.gearElement = this.require('#gear-value');
    this.missionPanel = this.require('#mission-tracker');
    this.promptElement = this.require('#world-prompt');
    this.countdownElement = this.require('#countdown');
    this.debugElement = this.require('#debug-panel');
    this.cameraElement = this.require('#camera-label');
    this.toastElement = this.require('#toast');
    this.renderGarage();
    this.renderMissionList();
    this.renderStats();
  }

  bind(handlers: UIHandlers): void {
    this.root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'continue') handlers.continue();
      if (action === 'new-game') handlers.newGame();
      if (action === 'resume') handlers.resume();
      if (action === 'restart') handlers.restart();
      if (action === 'quit-menu') handlers.quitToMenu();
      if (action === 'open-panel') this.openPanel(target.dataset.panel ?? 'home');
      if (action === 'close-panel') this.openPanel('home');
      if (action === 'select-vehicle' && target.dataset.id) handlers.selectVehicle(target.dataset.id);
      if (action === 'start-mission' && target.dataset.id) handlers.startMission(target.dataset.id);
    });
    this.require<HTMLInputElement>('#car-color').addEventListener('input', (event) => {
      handlers.setVehicleColor((event.target as HTMLInputElement).value);
    });
    this.require<HTMLSelectElement>('#weather-setting').addEventListener('change', (event) => {
      handlers.setWeather((event.target as HTMLSelectElement).value as Weather);
    });
    this.require<HTMLSelectElement>('#difficulty-setting').addEventListener('change', (event) => {
      handlers.setDifficulty((event.target as HTMLSelectElement).value as Difficulty);
    });
    this.require<HTMLSelectElement>('#quality-setting').addEventListener('change', (event) => {
      handlers.setQuality((event.target as HTMLSelectElement).value as SaveData['settings']['quality']);
    });
    this.require<HTMLInputElement>('#audio-setting').addEventListener('input', (event) => {
      handlers.setAudio(Number((event.target as HTMLInputElement).value));
    });
  }

  hideMenu(): void {
    this.require('#main-menu').classList.add('hidden');
    this.require('#pause-menu').classList.add('hidden');
    this.require('#hud').classList.remove('hidden', 'soft-hidden');
  }

  showMainMenu(): void {
    this.require('#main-menu').classList.remove('hidden');
    this.require('#pause-menu').classList.add('hidden');
    this.require('#hud').classList.add('hidden');
    this.openPanel('home');
    this.renderGarage();
    this.renderMissionList();
    this.renderStats();
  }

  showPause(paused: boolean): void {
    this.require('#pause-menu').classList.toggle('hidden', !paused);
    this.require('#hud').classList.toggle('soft-hidden', paused);
  }

  update(telemetry: VehicleTelemetry, mission: MissionHUDState, camera: CameraMode): void {
    const speed = Math.round(telemetry.speedKph);
    if (speed !== this.lastSpeed) {
      this.speedElement.textContent = String(speed).padStart(3, '0');
      this.require('#speed-dial').style.setProperty('--speed', `${Math.min(1, speed / 260) * 270}deg`);
      this.lastSpeed = speed;
    }
    this.rpmElement.style.setProperty('--rpm', `${Math.min(1, telemetry.rpm / 8500) * 100}%`);
    this.gearElement.textContent = telemetry.gear;
    this.cameraElement.textContent = camera;
    this.missionPanel.classList.toggle('active', mission.active);
    this.require('#mission-title').textContent = mission.title;
    this.require('#mission-objective').textContent = mission.objective;
    this.require('#mission-time').textContent = mission.timer;
    this.require('#mission-progress').textContent = mission.progress;
    this.require('#mission-score').textContent = mission.score > 0 ? mission.score.toLocaleString() : '';
    this.promptElement.textContent = mission.prompt ?? '';
    this.promptElement.classList.toggle('visible', Boolean(mission.prompt));
    this.countdownElement.textContent = mission.countdown > 0 ? String(mission.countdown) : '';
    this.countdownElement.classList.toggle('visible', mission.countdown > 0);
    this.drawMap(telemetry, mission.active);
  }

  updateDebug(fps: number, drawCalls: number, physicsBodies: number, telemetry: VehicleTelemetry, traffic: number): void {
    if (!this.debugVisible) return;
    this.debugElement.innerHTML = [
      `FPS <b>${fps.toFixed(0)}</b>`,
      `DRAW <b>${drawCalls}</b>`,
      `BODIES <b>${physicsBodies}</b>`,
      `TRAFFIC <b>${traffic}</b>`,
      `SPEED <b>${telemetry.speedKph.toFixed(1)}</b>`,
      `SLIP <b>${telemetry.slip.toFixed(2)}</b>`,
      `POS <b>${telemetry.position.x.toFixed(0)}, ${telemetry.position.z.toFixed(0)}</b>`
    ].join('<br>');
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    this.debugElement.classList.toggle('visible', this.debugVisible);
  }

  toggleMap(): void {
    this.mapExpanded = !this.mapExpanded;
    this.require('#minimap').classList.toggle('expanded', this.mapExpanded);
  }

  toast(message: string, tone: 'normal' | 'success' | 'danger' = 'normal'): void {
    window.clearTimeout(this.toastTimeout);
    this.toastElement.textContent = message;
    this.toastElement.dataset.tone = tone;
    this.toastElement.classList.add('visible');
    this.toastTimeout = window.setTimeout(() => this.toastElement.classList.remove('visible'), 3200);
  }

  refresh(save: SaveData): void {
    this.save = save;
    this.renderGarage();
    this.renderMissionList();
    this.renderStats();
  }

  private openPanel(panel: string): void {
    this.root.querySelectorAll<HTMLElement>('.menu-panel').forEach((element) => {
      element.classList.toggle('active', element.dataset.panel === panel);
    });
  }

  private renderGarage(): void {
    const list = this.require('#garage-list');
    list.innerHTML = VEHICLES.map((vehicle) => {
      const unlocked = this.save.unlockedVehicles.includes(vehicle.id);
      const selected = this.save.selectedVehicle === vehicle.id;
      const stats = [vehicle.topSpeed / 72, vehicle.acceleration / 13200, vehicle.handling / 2.85, vehicle.braking];
      return `<button class="car-card ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}" data-action="select-vehicle" data-id="${vehicle.id}" ${unlocked ? '' : 'disabled'}>
        <span class="car-swatch" style="--car-color:${this.save.vehicleColors[vehicle.id] ?? vehicle.color}"></span>
        <span class="car-info"><small>${vehicle.className}</small><strong>${vehicle.name}</strong><em>${unlocked ? vehicle.description : `Win ${vehicle.unlockWins} missions to unlock`}</em></span>
        <span class="car-stats">${stats.map((value) => `<i style="--value:${Math.round(value * 100)}%"></i>`).join('')}</span>
      </button>`;
    }).join('');
    const selected = VEHICLES.find((vehicle) => vehicle.id === this.save.selectedVehicle) ?? VEHICLES[0];
    this.require<HTMLInputElement>('#car-color').value = this.save.vehicleColors[selected.id] ?? selected.color;
    this.require('#credits-value').textContent = `${this.save.credits.toLocaleString()} CR`;
  }

  private renderMissionList(): void {
    const list = this.require('#mission-list');
    list.innerHTML = MISSIONS.map((mission) => {
      const record = this.save.missions[mission.id];
      const result = record?.bestTime !== undefined
        ? `${record.bestTime.toFixed(2)} SEC`
        : record?.bestScore !== undefined
          ? `${record.bestScore.toLocaleString()} PTS`
          : 'NOT ATTEMPTED';
      return `<button class="mission-card" data-action="start-mission" data-id="${mission.id}">
        <span class="mission-index">0${MISSIONS.indexOf(mission) + 1}</span>
        <span><small>${mission.subtitle}</small><strong>${mission.title}</strong><em>${result}</em></span>
        <span class="medal ${record?.medal ?? ''}">${record?.medal?.toUpperCase() ?? 'GO'}</span>
      </button>`;
    }).join('');
  }

  private renderStats(): void {
    const stats = this.save.stats;
    this.require('#stat-grid').innerHTML = [
      ['DISTANCE', `${(stats.distance / 1000).toFixed(1)} KM`],
      ['TOP SPEED', `${Math.round(stats.topSpeed)} KM/H`],
      ['WINS', String(stats.wins)],
      ['MISSIONS', String(stats.missionsCompleted)],
      ['PLAY TIME', `${Math.floor(stats.playTime / 3600)}H ${Math.floor((stats.playTime % 3600) / 60)}M`],
      ['CREDITS', `${this.save.credits.toLocaleString()} CR`]
    ].map(([label, value]) => `<div><small>${label}</small><strong>${value}</strong></div>`).join('');
  }

  private drawMap(telemetry: VehicleTelemetry, activeMission: boolean): void {
    const context = this.mapContext;
    const size = this.mapCanvas.width;
    context.clearRect(0, 0, size, size);
    context.fillStyle = 'rgba(4, 9, 16, .9)';
    context.fillRect(0, 0, size, size);
    const scale = size / WORLD_SIZE;
    context.strokeStyle = 'rgba(126, 153, 169, .28)';
    context.lineWidth = this.mapExpanded ? 4 : 2;
    for (let road = -600; road <= 600; road += 120) {
      const coordinate = size / 2 + road * scale;
      context.beginPath();
      context.moveTo(coordinate, 0);
      context.lineTo(coordinate, size);
      context.stroke();
      context.beginPath();
      context.moveTo(0, coordinate);
      context.lineTo(size, coordinate);
      context.stroke();
    }
    for (const mission of MISSIONS) {
      context.fillStyle = mission.kind === 'drift' ? '#ff4ea1' : mission.kind === 'sprint' ? '#50e6ff' : '#ffd35a';
      context.beginPath();
      context.arc(size / 2 + mission.start[0] * scale, size / 2 + mission.start[1] * scale, activeMission ? 3 : 4.5, 0, Math.PI * 2);
      context.fill();
    }
    context.save();
    context.translate(size / 2 + telemetry.position.x * scale, size / 2 + telemetry.position.z * scale);
    context.fillStyle = '#ffffff';
    context.shadowColor = '#50e6ff';
    context.shadowBlur = 8;
    context.beginPath();
    context.moveTo(0, -7);
    context.lineTo(5, 6);
    context.lineTo(0, 3.5);
    context.lineTo(-5, 6);
    context.closePath();
    context.fill();
    context.restore();
  }

  private require<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing UI element: ${selector}`);
    return element;
  }

  private template(): string {
    const { settings } = this.save;
    return `<main id="game-shell">
      <div id="viewport"></div>
      <div class="film-grain"></div>
      <section id="main-menu" class="screen-layer">
        <header class="menu-header"><span class="micro">湾岸 // 01:42</span><span class="status-dot">SHUTO NETWORK ONLINE</span></header>
        <div class="brand-block">
          <p>東京湾 ARCADE DRIVING</p>
          <h1>MIDNIGHT<br><span>SHUTO</span></h1>
          <div class="brand-rule"><i></i><b>2001 / REIMAGINED</b></div>
        </div>
        <div class="menu-panels">
          <div class="menu-panel active" data-panel="home">
            <nav class="main-actions">
              <button class="primary" data-action="continue"><span>01</span>CONTINUE <i>›</i></button>
              <button data-action="new-game"><span>02</span>NEW DRIVE <i>›</i></button>
              <button data-action="open-panel" data-panel="garage"><span>03</span>GARAGE <i>›</i></button>
              <button data-action="open-panel" data-panel="missions"><span>04</span>MISSIONS <i>›</i></button>
              <button data-action="open-panel" data-panel="settings"><span>05</span>SETTINGS <i>›</i></button>
              <button data-action="open-panel" data-panel="controls"><span>06</span>CONTROLS <i>›</i></button>
              <button data-action="open-panel" data-panel="credits"><span>07</span>CREDITS <i>›</i></button>
            </nav>
            <p class="menu-hint">WASD TO DRIVE&nbsp;&nbsp;•&nbsp;&nbsp;C TO CHANGE CAMERA&nbsp;&nbsp;•&nbsp;&nbsp;E TO RACE</p>
          </div>
          <div class="menu-panel wide-panel" data-panel="garage">
            <button class="back" data-action="close-panel">‹ BACK</button>
            <div class="panel-title"><div><small>VEHICLE STORAGE</small><h2>GARAGE</h2></div><b id="credits-value"></b></div>
            <div id="garage-list" class="card-list"></div>
            <label class="paint-picker">PAINT <input id="car-color" type="color" /></label>
          </div>
          <div class="menu-panel wide-panel" data-panel="missions">
            <button class="back" data-action="close-panel">‹ BACK</button>
            <div class="panel-title"><div><small>STREET EVENTS</small><h2>MISSIONS</h2></div><b>DRIVE TO START</b></div>
            <div id="mission-list" class="card-list"></div>
          </div>
          <div class="menu-panel wide-panel" data-panel="settings">
            <button class="back" data-action="close-panel">‹ BACK</button>
            <div class="panel-title"><div><small>SYSTEM CONFIG</small><h2>SETTINGS</h2></div></div>
            <div class="settings-grid">
              <label>WEATHER<select id="weather-setting"><option value="sunny" ${settings.weather === 'sunny' ? 'selected' : ''}>SUNNY</option><option value="sunset" ${settings.weather === 'sunset' ? 'selected' : ''}>SUNSET</option><option value="night" ${settings.weather === 'night' ? 'selected' : ''}>NIGHT</option><option value="rain" ${settings.weather === 'rain' ? 'selected' : ''}>RAIN</option></select></label>
              <label>DIFFICULTY<select id="difficulty-setting"><option value="easy" ${settings.difficulty === 'easy' ? 'selected' : ''}>EASY</option><option value="medium" ${settings.difficulty === 'medium' ? 'selected' : ''}>MEDIUM</option><option value="hard" ${settings.difficulty === 'hard' ? 'selected' : ''}>HARD</option></select></label>
              <label>GRAPHICS<select id="quality-setting"><option value="performance" ${settings.quality === 'performance' ? 'selected' : ''}>PERFORMANCE</option><option value="balanced" ${settings.quality === 'balanced' ? 'selected' : ''}>BALANCED</option><option value="high" ${settings.quality === 'high' ? 'selected' : ''}>HIGH</option></select></label>
              <label>AUDIO<input id="audio-setting" type="range" min="0" max="1" step="0.01" value="${settings.audio}" /></label>
            </div>
          </div>
          <div class="menu-panel wide-panel" data-panel="controls">
            <button class="back" data-action="close-panel">‹ BACK</button>
            <div class="panel-title"><div><small>DRIVER INPUT</small><h2>CONTROLS</h2></div></div>
            <div class="control-grid"><div><kbd>W</kbd><span>THROTTLE</span></div><div><kbd>S</kbd><span>BRAKE / REVERSE</span></div><div><kbd>A D</kbd><span>STEER</span></div><div><kbd>SPACE</kbd><span>HANDBRAKE</span></div><div><kbd>C</kbd><span>CAMERA</span></div><div><kbd>E</kbd><span>START MISSION</span></div><div><kbd>M</kbd><span>MAP</span></div><div><kbd>R</kbd><span>RECOVER</span></div></div>
            <p class="support-note">Xbox and compatible gamepads are detected automatically.</p>
          </div>
          <div class="menu-panel wide-panel" data-panel="credits">
            <button class="back" data-action="close-panel">‹ BACK</button>
            <div class="panel-title"><div><small>DRIVER HISTORY</small><h2>PROFILE</h2></div></div>
            <div id="stat-grid" class="stat-grid"></div>
            <p class="support-note">Designed and built for the open web with Three.js, cannon-es, TypeScript, and WebAudio.</p>
          </div>
        </div>
        <footer class="menu-footer"><span>BUILD 0.1 // STATIC WEB EDITION</span><span>渋谷 • 横浜 • 大阪</span></footer>
      </section>

      <section id="hud" class="hidden">
        <div id="mission-tracker"><small id="mission-objective">Explore Shuto City</small><strong id="mission-title">FREE DRIVE</strong><div><b id="mission-time"></b><span id="mission-progress"></span><em id="mission-score"></em></div></div>
        <div id="minimap"><canvas id="minimap-canvas" width="300" height="300"></canvas><span>N</span></div>
        <div id="camera-label">CHASE</div>
        <div id="speed-cluster">
          <div id="speed-dial"><div><span id="speed-value">000</span><small>KM/H</small></div></div>
          <div class="gear-box"><small>GEAR</small><b id="gear-value">N</b></div>
          <div id="rpm-bar"><i></i><small>1&nbsp;&nbsp;2&nbsp;&nbsp;3&nbsp;&nbsp;4&nbsp;&nbsp;5&nbsp;&nbsp;6&nbsp;&nbsp;7&nbsp;&nbsp;8 RPM</small></div>
        </div>
        <div id="world-prompt"></div>
        <div id="countdown"></div>
        <div id="debug-panel"></div>
      </section>

      <section id="pause-menu" class="screen-layer hidden">
        <div class="pause-card"><small>01:42 // RUN PAUSED</small><h2>TAKE A<br>BREATH.</h2><button class="primary" data-action="resume">RESUME</button><button data-action="restart">RECOVER CAR</button><button data-action="quit-menu">QUIT TO MENU</button></div>
      </section>
      <div id="toast"></div>
    </main>`;
  }
}
