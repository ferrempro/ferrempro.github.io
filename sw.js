// RemPro Control V2 — service worker
// Corrige dos riesgos señalados en la auditoría del 2026-09-16:
//  1) El "activate" anterior borraba CUALQUIER caché con nombre distinto al
//     actual, incluida la de otras herramientas del mismo origen
//     (calculadoras, simuladores, checklists). Ahora sólo se tocan cachés
//     cuyo nombre empieza con el prefijo propio de RemPro Control.
//  2) "cache.put" no formaba parte de un waitUntil ni se esperaba (await),
//     así que el navegador podía terminar el fetch antes de que la
//     escritura en caché se completara. Ahora se espera (await) y además
//     se extiende la vida del evento con event.waitUntil.
// El SDK de Supabase se carga desde jsDelivr (otro origen) y se deja fuera
// del precache a propósito: sin red, la app sigue funcionando en modo local.
const CACHE_PREFIX = 'rempro-control-v2-';
const CACHE = CACHE_PREFIX + '12';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './data-store.js',
  './civil-calculator.js',
  './supabase-config.js',
  './supabase-client.js',
  './sync.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    return cached || caches.match('./index.html');
  }
}

async function networkFirstAsset(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return caches.match(request);
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }

  event.respondWith(networkFirstAsset(event.request));
});
