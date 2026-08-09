const CACHE_NAME = 'midnight-shuto-v2';
const ROOT_URL = new URL('./', self.location.href);
const EXTRA_ASSETS = [
  './models/kaze.glb',
  './models/michi.glb',
  './models/raiden.glb',
  './models/shogun.glb'
];

async function precacheBuild() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(ROOT_URL, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Unable to cache the game shell.');
  await cache.put(ROOT_URL, response.clone());
  const html = await response.text();
  const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], ROOT_URL))
    .filter((url) => url.origin === ROOT_URL.origin && url.pathname.startsWith(ROOT_URL.pathname));
  for (const extra of EXTRA_ASSETS) {
    assetUrls.push(new URL(extra, ROOT_URL));
  }
  await Promise.allSettled(assetUrls.map((url) => cache.add(url)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheBuild().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== ROOT_URL.origin) return;
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => cache.match(event.request, { ignoreVary: true })).then(async (cached) => {
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch (error) {
        if (event.request.mode === 'navigate') {
          const cache = await caches.open(CACHE_NAME);
          return cache.match(ROOT_URL, { ignoreVary: true });
        }
        throw error;
      }
    })
  );
});
