import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const artifacts = fileURLToPath(new URL('../e2e-artifacts/', import.meta.url));
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const origin = process.env.SHOT_ORIGIN ?? 'http://127.0.0.1:5188';
const modes = [
  { presses: 2, name: 'hood' },
  { presses: 3, name: 'dash' }
];
const vehicles = (process.env.SHOT_VEHICLE ?? 'kaze,michi,raiden,shogun').split(',');

await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--enable-gpu']
});

try {
  for (const vehicle of vehicles) {
    for (const mode of modes) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      page.on('pageerror', (error) => console.error(vehicle, mode.name, error.message));
      await page.addInitScript((selected) => {
        localStorage.setItem('midnight-shuto-save-v1', JSON.stringify({
          selectedVehicle: selected,
          unlockedVehicles: ['kaze', 'michi', 'raiden', 'shogun'],
          settings: { quality: 'high', audio: 0, weather: 'sunset' }
        }));
      }, vehicle);
      await page.goto(`${origin}/?debug=1`, { waitUntil: 'networkidle' });
      await page.locator('[data-action="continue"]').click({ force: true });
      await page.locator('#hud').waitFor({ state: 'visible' });
      for (let i = 0; i < mode.presses; i += 1) await page.keyboard.press('c');
      await page.waitForTimeout(400);
      await page.keyboard.down('w');
      await page.waitForTimeout(1600);
      await page.screenshot({ path: join(artifacts, `interior-${vehicle}-${mode.name}.png`) });
      await page.keyboard.up('w');
      const label = (await page.locator('#camera-label').innerText()).trim();
      console.log(`${vehicle} ${mode.name} -> ${label}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
