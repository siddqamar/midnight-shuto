import './styles.css';
import { Game } from './core/Game';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href);
  });
}

if (!('WebGLRenderingContext' in window)) {
  document.querySelector('#app')!.innerHTML = '<main style="padding:3rem;color:white;background:#080b12;height:100vh;font-family:sans-serif"><h1>WebGL is required</h1><p>Please open Midnight Shuto in a current version of Chrome, Edge, Firefox, or Safari.</p></main>';
} else {
  new Game();
}
