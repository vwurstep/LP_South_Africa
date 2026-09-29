/* Service worker. App shell + guide data: network first (updates arrive when online),
   cache fallback (offline). Map tiles/fonts/sprites/style: cache first, kept in a
   separate cache that survives app updates. CACHE is set by tools/release.py (same stamp
   as version.json, which the app compares to offer "update available"). */
var CACHE = 'lpsa-2026-09-29.223629';
var TILES = 'lpsa-tiles';
var FILES = ['./', './index.html', './src/style.css', './src/app.js', './src/data.js', './src/map.js',
             './src/sheet.js', './lib/maplibre-gl.js', './lib/maplibre-gl.css', './data/guide.enc.json',
             './manifest.webmanifest', './version.json', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== TILES; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.hostname === 'tiles.openfreemap.org') {
    // cache: 'reload' requests (from "save offline") refresh the stored copy
    var refresh = e.request.cache === 'reload';
    e.respondWith(caches.open(TILES).then(function (c) {
      return (refresh ? Promise.resolve(null) : c.match(e.request.url)).then(function (hit) {
        return hit || fetch(e.request.url).then(function (res) {
          if (res.ok) c.put(e.request.url, res.clone());
          return res;
        });
      });
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // no-cache: always revalidate with the server (GitHub Pages sends max-age=600, which
  // would otherwise serve stale app files for 10 minutes after an update)
  e.respondWith(fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
    var copy = res.clone();
    if (res.ok) caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return res;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
});
