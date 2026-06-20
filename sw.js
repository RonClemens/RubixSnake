// Minimal service worker — exists mainly to satisfy Chrome/Android's PWA
// installability requirement (manifest + a fetch-handling service worker)
// so the app can be added to the home screen and registered as a share target.
const CACHE = 'rubix-snake-v1';
const SHELL = ['./index.html', './manifest.webmanifest', './video-import.html'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
});

self.addEventListener('fetch', function (e) {
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      return cached || fetch(e.request);
    })
  );
});
