import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const root = new URL('../', import.meta.url);
const artifacts = new URL('../e2e-artifacts/', import.meta.url);
const artifactsPath = fileURLToPath(artifacts);
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 4175;
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

const seedSave = async (page, selectedVehicle = 'kaze') => {
  await page.addInitScript(({ selected, unlocked }) => {
    localStorage.setItem('midnight-shuto-save-v1', JSON.stringify({
      selectedVehicle: selected,
      unlockedVehicles: unlocked,
      settings: { quality: 'performance', audio: 0 }
    }));
  }, { selected: selectedVehicle, unlocked: vehicles });
};

const watchBrowserErrors = (page, errors) => {
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
};

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--ignore-gpu-blocklist', '--enable-webgl', '--enable-gpu']
  });

  const errors = [];
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const desktop = await desktopContext.newPage();
  watchBrowserErrors(desktop, errors);
  await seedSave(desktop);
  await desktop.goto(origin, { waitUntil: 'networkidle' });
  await desktop.locator('[data-panel="garage"][data-action="open-panel"]').click({ force: true });
  await desktop.locator('#garage-list .car-preview').first().waitFor({ state: 'visible' });
  const previewProfiles = await desktop.locator('.car-preview .preview-body').evaluateAll((paths) => paths.map((path) => path.getAttribute('d')));
  if (previewProfiles.length !== 4 || new Set(previewProfiles).size !== 4) throw new Error('Garage previews are missing distinct vehicle silhouettes.');
  await desktop.screenshot({ path: join(artifactsPath, 'garage-desktop.png') });
  await desktop.locator('[data-action="select-vehicle"][data-id="shogun"]').click();
  if (!await desktop.locator('[data-id="shogun"]').evaluate((card) => card.classList.contains('selected'))) throw new Error('Vehicle selection did not update the active model.');
  await desktopContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mobile = await mobileContext.newPage();
  watchBrowserErrors(mobile, errors);
  await seedSave(mobile, 'shogun');
  await mobile.goto(origin, { waitUntil: 'networkidle' });
  await mobile.locator('[data-panel="garage"][data-action="open-panel"]').click({ force: true });
  await mobile.locator('#garage-list .car-preview').first().waitFor({ state: 'visible' });
  const garageBounds = await mobile.locator('.wide-panel.active').boundingBox();
  if (!garageBounds || garageBounds.x < 0 || garageBounds.x + garageBounds.width > 390) throw new Error('Mobile garage overflows the viewport.');
  await mobile.screenshot({ path: join(artifactsPath, 'garage-mobile.png') });
  await mobile.locator('.menu-panel.active [data-action="close-panel"]').click({ force: true });
  await mobile.locator('[data-action="continue"]').click({ force: true });
  await mobile.keyboard.down('w');
  await mobile.waitForTimeout(2200);
  await mobile.keyboard.up('w');
  const mobileSpeed = Number(await mobile.locator('#speed-value').textContent());
  if (mobileSpeed < 5) throw new Error(`Mobile vehicle did not accelerate: ${mobileSpeed} km/h.`);
  await mobile.screenshot({ path: join(artifactsPath, 'drive-mobile.png') });
  await mobileContext.close();

  for (const vehicle of vehicles) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    watchBrowserErrors(page, errors);
    await seedSave(page, vehicle);
    await page.goto(`${origin}/?debug=1`, { waitUntil: 'networkidle' });
    await page.locator('[data-action="continue"]').click({ force: true });
    await page.locator('#hud').waitFor({ state: 'visible' });
    for (let cycle = 0; cycle < 4; cycle += 1) await page.keyboard.press('c');
    await page.waitForFunction(() => document.querySelector('#camera-label')?.textContent === 'ORBIT');
    await page.waitForTimeout(2600);
    const wheels = await page.evaluate(() => window.__shutoDebug?.().visual.wheels ?? []);
    const wheelSpread = (axis) => {
      const values = wheels.map((wheel) => wheel[axis]);
      return Math.max(...values) - Math.min(...values);
    };
    if (wheels.length !== 4 || wheelSpread('x') < 1.2 || wheelSpread('z') < 2.2) {
      throw new Error(`${vehicle} wheels are not distributed across both axles: ${JSON.stringify(wheels)}`);
    }
    await page.screenshot({ path: join(artifactsPath, `vehicle-${vehicle}.png`) });
    await context.close();
  }

  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  console.log('Visual E2E passed: four distinct garage previews, desktop/mobile layout, and four in-game vehicle renders.');
} finally {
  await browser?.close();
  server.kill();
}
