import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const root = new URL('../', import.meta.url);
const artifacts = new URL('../e2e-artifacts/', import.meta.url);
const artifactsPath = fileURLToPath(artifacts);
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 4173;
const origin = `http://127.0.0.1:${port}`;

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    localStorage.setItem('midnight-shuto-save-v1', JSON.stringify({ settings: { quality: 'performance' } }));
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.location().url || 'unknown'}: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`response: ${response.status()} ${response.url()}`);
  });

  await page.goto(`${origin}/?debug=1`, { waitUntil: 'networkidle' });
  await page.locator('h1').waitFor({ state: 'visible' });
  await page.waitForTimeout(1800);
  if (await page.locator('#viewport canvas').count() !== 1) throw new Error('WebGL canvas was not created.');
  await page.screenshot({ path: join(artifactsPath, 'menu.png') });

  await page.locator('[data-action="continue"]').click({ force: true });
  await page.locator('#hud').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    window.addEventListener('keydown', (event) => { window.__lastTestKey = event.code; });
  });
  await page.keyboard.press('F3');
  await page.keyboard.down('w');
  await page.waitForTimeout(1800);
  const physicsSnapshot = await page.evaluate(() => window.__shutoDebug?.());
  await page.keyboard.down('d');
  await page.waitForTimeout(650);
  await page.keyboard.up('d');
  await page.keyboard.up('w');
  await page.waitForTimeout(250);
  const speed = Number(await page.locator('#speed-value').innerText());
  const inputCode = await page.evaluate(() => window.__lastTestKey);
  const drivingDebug = await page.locator('#debug-panel').innerText();
  await page.screenshot({ path: join(artifactsPath, 'drive.png') });
  if (!Number.isFinite(speed) || speed < 5) throw new Error(`Vehicle did not accelerate. HUD speed: ${speed}. Last input: ${inputCode}. Debug: ${drivingDebug.replaceAll('\n', ' | ')}. Physics: ${JSON.stringify(physicsSnapshot)}`);

  await page.keyboard.press('c');
  await page.waitForTimeout(250);
  if ((await page.locator('#camera-label').innerText()).trim() !== 'FAR') throw new Error('Camera cycle did not reach FAR mode.');
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__shutoReset?.());
  await page.keyboard.down('w');
  await page.waitForTimeout(1600);
  await page.keyboard.up('w');
  await page.waitForTimeout(150);
  await page.keyboard.press('F3');
  const sampleMountedCamera = async (expectedMode) => {
    await page.keyboard.press('c');
    await page.waitForFunction((mode) => document.querySelector('#camera-label')?.textContent === mode, expectedMode);
    const samples = await page.evaluate(async () => {
      const frames = [];
      for (let frame = 0; frame < 24; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const snapshot = window.__shutoDebug?.();
        const camera = snapshot?.feedback.cameraPosition;
        const body = snapshot?.body.position;
        frames.push({
          x: camera.x - body.x,
          y: camera.y - body.y,
          z: camera.z - body.z,
          trackingError: snapshot.feedback.mountedTrackingError
        });
      }
      return frames;
    });
    const spread = Math.max(...['x', 'y', 'z'].map((axis) => {
      const values = samples.map((sample) => sample[axis]);
      return Math.max(...values) - Math.min(...values);
    }));
    if (spread > 0.35) throw new Error(`${expectedMode} camera did not settle atomically. Relative-position spread: ${spread.toFixed(3)} m.`);
    const maximumTrackingError = Math.max(...samples.map((sample) => sample.trackingError));
    if (maximumTrackingError > 0.01) throw new Error(`${expectedMode} camera detached from its vehicle socket by ${maximumTrackingError.toFixed(3)} m.`);
    await page.screenshot({ path: join(artifactsPath, `camera-${expectedMode.toLowerCase()}.png`) });
  };
  await sampleMountedCamera('HOOD');
  await sampleMountedCamera('DASH');
  const debug = await page.locator('#debug-panel').innerText();
  const fps = Number(debug.match(/FPS\s+(\d+)/)?.[1] ?? 0);
  if (fps < 20) throw new Error(`Headless frame rate was unexpectedly low: ${fps} FPS.`);

  await page.keyboard.press('Escape');
  await page.locator('#pause-menu').waitFor({ state: 'visible' });
  await page.locator('[data-action="quit-menu"]').click({ force: true });
  await page.locator('#main-menu').waitFor({ state: 'visible' });
  await page.locator('[data-panel="missions"][data-action="open-panel"]').click({ force: true });
  await page.locator('.mission-card').first().click({ force: true });
  await page.waitForTimeout(300);
  const missionTitle = (await page.locator('#mission-title').innerText()).trim();
  if (missionTitle !== 'Bayline Rush') throw new Error(`Mission did not start. Found: ${missionTitle}`);
  await page.screenshot({ path: join(artifactsPath, 'mission.png') });

  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 10000 });
  const cacheSnapshot = await page.evaluate(async () => {
    const keys = await caches.keys();
    const entries = await Promise.all(keys.map(async (key) => ({
      key,
      urls: (await caches.open(key).then((cache) => cache.keys())).map((request) => request.url)
    })));
    return entries;
  });
  await page.context().setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  try {
    await page.locator('h1').waitFor({ state: 'visible', timeout: 10000 });
  } catch {
    throw new Error(`Offline reload failed. Caches: ${JSON.stringify(cacheSnapshot)}. Browser errors: ${errors.join(' | ')}`);
  }
  await page.context().setOffline(false);

  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  console.log(`E2E passed: acceleration ${speed} km/h, headless ${fps} FPS, mission ${missionTitle}, offline reload ready.`);
} finally {
  await browser?.close();
  server.kill();
}
