import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const root = new URL('../', import.meta.url);
const artifacts = new URL('../e2e-artifacts/', import.meta.url);
const artifactsPath = fileURLToPath(artifacts);
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 4174;
const origin = `http://127.0.0.1:${port}`;
const vehicles = ['kaze', 'michi', 'raiden', 'shogun'];

await mkdir(artifacts, { recursive: true });

const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--configLoader', 'runner'],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
);

const waitForServer = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Preview server did not become ready.');
};

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--ignore-gpu-blocklist', '--enable-webgl', '--enable-gpu']
  });

  const results = [];
  for (const vehicle of vehicles) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.addInitScript(({ selectedVehicle, unlockedVehicles }) => {
      localStorage.setItem('midnight-shuto-save-v1', JSON.stringify({
        selectedVehicle,
        unlockedVehicles,
        settings: { quality: 'performance', audio: 0 }
      }));
    }, { selectedVehicle: vehicle, unlockedVehicles: vehicles });
    await page.goto(`${origin}/?debug=1`, { waitUntil: 'networkidle' });
    await page.locator('[data-action="continue"]').click({ force: true });
    await page.locator('#hud').waitFor({ state: 'visible' });

    const baseFeedback = await page.evaluate(() => window.__shutoDebug?.().feedback);
    await page.keyboard.down('w');
    const startedAt = performance.now();
    let zeroToEighty = null;
    let maximumSpeed = 0;
    let lowSpeedFeedback = 0;
    let maximumFeedback = 0;
    let maximumCameraFov = Number(baseFeedback?.cameraFov ?? 0);
    let maximumAudioFeedback = 0;
    let feedbackMismatch = 0;
    let capturedHighSpeed = false;
    for (let sample = 0; sample < 36; sample += 1) {
      await page.waitForTimeout(500);
      const snapshot = await page.evaluate(() => ({
        speed: Number(document.querySelector('#speed-value')?.textContent ?? 0),
        feedback: window.__shutoDebug?.().feedback,
        visualIntensity: Number(getComputedStyle(document.querySelector('#speed-effects')).getPropertyValue('--speed-intensity'))
      }));
      const speed = snapshot.speed;
      const feedback = Number(snapshot.feedback?.cameraIntensity ?? 0);
      maximumSpeed = Math.max(maximumSpeed, speed);
      maximumFeedback = Math.max(maximumFeedback, feedback);
      maximumCameraFov = Math.max(maximumCameraFov, Number(snapshot.feedback?.cameraFov ?? 0));
      maximumAudioFeedback = Math.max(maximumAudioFeedback, Number(snapshot.feedback?.audioIntensity ?? 0));
      feedbackMismatch = Math.max(feedbackMismatch, Math.abs(snapshot.visualIntensity - feedback));
      if (vehicle === 'shogun' && speed >= 150 && !capturedHighSpeed) {
        await page.screenshot({ path: join(artifactsPath, 'high-speed.png') });
        capturedHighSpeed = true;
      }
      if (speed < 75) lowSpeedFeedback = Math.max(lowSpeedFeedback, feedback);
      if (zeroToEighty === null && speed >= 80) zeroToEighty = (performance.now() - startedAt) / 1000;
    }
    await page.keyboard.up('w');

    await page.keyboard.press('r');
    const roadRecoverySnapshot = await page.evaluate(() => window.__shutoDebug?.());
    await page.evaluate(() => window.__shutoReset?.());
    let controlSnapshot = await page.evaluate(() => window.__shutoDebug?.());
    await page.keyboard.down('w');
    for (let sample = 0; sample < 80; sample += 1) {
      await page.waitForTimeout(200);
      controlSnapshot = await page.evaluate(() => window.__shutoDebug?.());
      if ((controlSnapshot?.telemetry.speedKph ?? 0) >= 120) break;
    }
    await page.keyboard.up('w');
    const controlEntrySpeed = Number(controlSnapshot?.telemetry.speedKph ?? 0);
    await page.keyboard.down('w');
    await page.keyboard.down('d');
    await page.waitForTimeout(600);
    await page.keyboard.up('d');
    await page.keyboard.up('w');
    const handlingSnapshot = await page.evaluate(() => window.__shutoDebug?.());

    const brakingStartedAt = performance.now();
    let brakingSpeed = Number(handlingSnapshot?.telemetry.speedKph ?? 0);
    await page.keyboard.down('s');
    for (let sample = 0; sample < 60 && brakingSpeed > 10; sample += 1) {
      await page.waitForTimeout(100);
      brakingSpeed = Number(await page.locator('#speed-value').textContent());
    }
    await page.keyboard.up('s');
    const brakingSeconds = (performance.now() - brakingStartedAt) / 1000;

    await page.evaluate(() => window.__shutoReset?.());
    await page.keyboard.down('w');
    let driftSpeed = 0;
    for (let sample = 0; sample < 60 && driftSpeed < 85; sample += 1) {
      await page.waitForTimeout(200);
      driftSpeed = Number(await page.locator('#speed-value').textContent());
    }
    await page.keyboard.down('d');
    await page.keyboard.down('Space');
    let drifted = false;
    // Allow the real renderer enough fixed-step frames to build lateral slip.
    // A one-second window was timing-sensitive in headless Chromium.
    for (let sample = 0; sample < 20; sample += 1) {
      await page.waitForTimeout(100);
      const driftSnapshot = await page.evaluate(() => window.__shutoDebug?.());
      drifted ||= Boolean(driftSnapshot?.telemetry.drifting);
    }
    await page.keyboard.up('Space');
    await page.keyboard.up('d');
    // Recovery is sampled after the handbrake and steering keyup events have
    // propagated through the renderer and physics loop.
    await page.waitForTimeout(2200);
    const recoverySnapshot = await page.evaluate(() => window.__shutoDebug?.());
    await page.keyboard.up('w');

    results.push({
      vehicle,
      maximumSpeed,
      zeroToEighty,
      baseFeedback,
      lowSpeedFeedback,
      maximumFeedback,
      maximumCameraFov,
      maximumAudioFeedback,
      feedbackMismatch,
      roadRecoverySnapshot,
      controlEntrySpeed,
      handlingSnapshot,
      brakingSeconds,
      brakingSpeed,
      drifted,
      recoverySnapshot
    });
    await page.close();
  }

  console.table(results.map((result) => ({
    vehicle: result.vehicle,
    '0-80 km/h': result.zeroToEighty === null ? 'not reached' : `${result.zeroToEighty.toFixed(2)} s`,
    'maximum km/h': result.maximumSpeed,
    'speed effect': result.maximumFeedback.toFixed(2),
    'braking': `${result.brakingSeconds.toFixed(2)} s`,
    'drift recovery': Number(result.recoverySnapshot?.telemetry.slip ?? 0).toFixed(2)
  })));

  const failures = [];
  for (const result of results) {
    if (result.maximumSpeed < 120) failures.push(`${result.vehicle} reached only ${result.maximumSpeed} km/h`);
    if (result.zeroToEighty === null || result.zeroToEighty > 10) failures.push(`${result.vehicle} did not reach 80 km/h within 10 seconds`);
    if (result.lowSpeedFeedback > 0.01) failures.push(`${result.vehicle} activated high-speed feedback below 80 km/h`);
    if (result.maximumFeedback < 0.15) failures.push(`${result.vehicle} did not produce noticeable high-speed feedback`);
    if (result.maximumCameraFov < (result.baseFeedback?.cameraFov ?? 0) + 4) failures.push(`${result.vehicle} did not expand the camera FOV enough`);
    if (result.maximumAudioFeedback < 0.15) failures.push(`${result.vehicle} did not increase high-speed audio feedback`);
    if (result.feedbackMismatch > 0.02) failures.push(`${result.vehicle} visual and camera feedback were not synchronized`);
    const recoveryPosition = result.roadRecoverySnapshot?.body.position;
    const recoveryRotation = result.roadRecoverySnapshot?.body.quaternion;
    const recoveryForwardX = 2 * (recoveryRotation?.w ?? 1) * (recoveryRotation?.y ?? 0);
    const recoveryForwardZ = 1 - 2 * Math.pow(recoveryRotation?.y ?? 0, 2);
    const recoveryFacesOutward = (recoveryPosition?.x >= 600 && recoveryForwardX > 0.05) ||
      (recoveryPosition?.x <= -600 && recoveryForwardX < -0.05) ||
      (recoveryPosition?.z >= 600 && recoveryForwardZ > 0.05) ||
      (recoveryPosition?.z <= -600 && recoveryForwardZ < -0.05);
    if (Math.abs(recoveryPosition?.x ?? 0) > 600 || Math.abs(recoveryPosition?.z ?? 0) > 600 || recoveryFacesOutward) failures.push(`${result.vehicle} recovered into an unsafe boundary position`);
    if (result.controlEntrySpeed < 120) failures.push(`${result.vehicle} could not enter the handling test at 120 km/h`);
    if ((result.handlingSnapshot?.telemetry.speedKph ?? 0) < 80) failures.push(`${result.vehicle} lost too much speed while steering`);
    if ((result.handlingSnapshot?.telemetry.slip ?? 1) > 0.45) failures.push(`${result.vehicle} became unstable during normal high-speed steering`);
    if (Math.abs(result.handlingSnapshot?.body.angularVelocity.y ?? 0) < 0.05) failures.push(`${result.vehicle} did not respond to high-speed steering`);
    if (Math.abs(result.handlingSnapshot?.body.angularVelocity.y ?? 0) > 1.5) failures.push(`${result.vehicle} rotated too aggressively during high-speed steering`);
    if (result.brakingSpeed > 10 || result.brakingSeconds > 4.5) failures.push(`${result.vehicle} did not brake from high speed in a controllable distance`);
    if (result.brakingSeconds < 1.4) failures.push(`${result.vehicle} braking was too abrupt at high speed`);
    if (!result.drifted) failures.push(`${result.vehicle} could not initiate a handbrake drift`);
    if ((result.recoverySnapshot?.telemetry.slip ?? 1) > 0.22) failures.push(`${result.vehicle} did not recover cleanly from a drift`);
    if ((result.recoverySnapshot?.body.position.y ?? 0) < 0 || (result.recoverySnapshot?.body.position.y ?? 0) > 1.5) failures.push(`${result.vehicle} left the road surface during handling QA`);
  }
  for (let index = 1; index < results.length; index += 1) {
    const previous = results[index - 1];
    const current = results[index];
    if (current.maximumSpeed < previous.maximumSpeed + 8) {
      failures.push(`${current.vehicle} was not clearly faster than ${previous.vehicle}`);
    }
  }
  if (failures.length > 0) throw new Error(`Vehicle performance acceptance failed:\n${failures.join('\n')}`);
} finally {
  await browser?.close();
  server.kill();
}
