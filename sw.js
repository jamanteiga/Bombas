const CACHE = 'bombas-v5';
const ASSETS = [
  './',
  'index.html',
  'app.js',
  'css/style.css',
  'js/engine.js',
  'js/chart.js',
  'manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});