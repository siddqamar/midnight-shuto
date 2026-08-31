import { readFile } from 'node:fs/promises';
import { defineConfig, transformWithEsbuild, type Plugin } from 'vite';

const serviceWorkerPlugin = (): Plugin => ({
  name: 'emit-service-worker',
  async generateBundle() {
    const source = await readFile(new URL('./src/sw.ts', import.meta.url), 'utf8');
    const { code } = await transformWithEsbuild(source, 'sw.ts', {
      loader: 'ts',
      target: 'es2022',
    });
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: code });
  },
});

export default defineConfig({
  plugins: [serviceWorkerPlugin()],
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 520,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          physics: ['cannon-es']
        }
      }
    }
  }
});
