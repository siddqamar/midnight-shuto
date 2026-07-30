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
    results.push({ vehicle, maximumSpeed, zeroToEighty, baseFeedback, lowSpeedFeedback, maximumFeedback, maximumCameraFov, maximumAudioFeedback, feedbackMismatch });
    await page.close();
  }

  console.table(results.map((result) => ({
    vehicle: result.vehicle,
    '0-80 km/h': result.zeroToEighty === null ? 'not reached' : `${result.zeroToEighty.toFixed(2)} s`,
    'maximum km/h': result.maximumSpeed,
    'speed effect': result.maximumFeedback.toFixed(2)
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
