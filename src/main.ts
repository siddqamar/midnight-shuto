import './styles.css';
import { Game } from './core/Game';
import { preloadVehicleModels } from './vehicles/modelRegistry';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href);
  });
}

async function boot(): Promise<void> {
  if (!('WebGLRenderingContext' in window)) {
    document.querySelector('#app')!.innerHTML = '<main style="padding:3rem;color:white;background:#080b12;height:100vh;font-family:sans-serif"><h1>WebGL is required</h1><p>Please open Midnight Shuto in a current version of Chrome, Edge, Firefox, or Safari.</p></main>';
    return;
  }

  const app = document.querySelector('#app');
  if (app) {
    const loading = document.createElement('div');
    loading.id = 'boot-loading';
    loading.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#080b12;color:#dce7f5;font:600 14px/1.4 system-ui,sans-serif;z-index:50;letter-spacing:.08em';
    loading.textContent = 'LOADING VEHICLES…';
    app.appendChild(loading);
    try {
      await preloadVehicleModels();
    } catch (error) {
      loading.textContent = 'FAILED TO LOAD VEHICLE MODELS';
      console.error(error);
      return;
    }
    loading.remove();
  } else {
    await preloadVehicleModels();
  }

  new Game();
}

void boot();
