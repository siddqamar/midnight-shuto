/**
 * Run Blender headless export for vehicle GLBs.
 * Requires Blender on PATH, or BLENDER_PATH env pointing at blender executable.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'tools', 'blender', 'build_cars.py');

const candidates = [
  process.env.BLENDER_PATH,
  'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
  '/usr/bin/blender',
  '/Applications/Blender.app/Contents/MacOS/Blender',
  'blender'
].filter(Boolean);

function resolveBlender() {
  for (const candidate of candidates) {
    if (candidate === 'blender') return candidate;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const blender = resolveBlender();
if (!blender) {
  console.error('Blender not found. Install with: winget install BlenderFoundation.Blender');
  console.error('Or set BLENDER_PATH to the blender executable.');
  process.exit(1);
}

console.log(`Using Blender: ${blender}`);
const result = spawnSync(blender, ['--background', '--python', script], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    OUTPUT_DIR: process.env.OUTPUT_DIR ?? path.join(root, 'public', 'models')
  }
});

process.exit(result.status ?? 1);
