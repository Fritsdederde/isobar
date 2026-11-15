/* Isobar — service worker: de app zelf werkt ook zonder internet (weerdata komt dan uit de laatste keer) */
const VERSION = 'isobar-v2';
const SHELL = ['./', 'index.html', 'style.css', 'js/data.js', 'js/text.js', 'js/geo.js', 'js/map.js', 'js/ui.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // weerdata: altijd rechtstreeks
  // eerst het netwerk (zodat een nieuwe versie meteen binnenkomt), anders de bewaarde kopie
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
