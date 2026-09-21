// Each worker serves only its own complete application cache.
const CACHE_PREFIX = 'rempro-control-v2-';
const CACHE = CACHE_PREFIX + '5';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./data-store.js','./supabase-config.js','./supabase-client.js','./sync.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const assetURLs = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  // Activate when existing tabs close, so an old page does not switch workers mid-session.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key))
  )));
});
async function currentAsset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  return cached || fetch(request);
}
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const clean = new URL(url); clean.search = ''; clean.hash = '';
  if (!assetURLs.has(clean.href)) return;
  // Serve HTML and scripts from the same installed release, including offline.
  event.respondWith(currentAsset(clean.href));
});
