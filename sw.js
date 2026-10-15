// Service worker: precaches the app shell, the program and all exercise images so the
// app opens and works with no signal. Bump VERSION on every deploy.
const VERSION = 'pk-v2';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'data/program.json',
  'vendor/chart.umd.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'js/app.js',
  'js/achievements.js',
  'js/charts.js',
  'js/db.js',
  'js/export.js',
  'js/friend.js',
  'js/program.js',
  'js/progression.js',
  'js/schema.js',
  'js/settings.js',
  'js/spotify.js',
  'js/stats.js',
  'js/sync.js',
  'js/timer.js',
  'js/ui.js',
  'js/util.js',
  'js/workout.js',
  'js/screens/analytics.js',
  'js/screens/exercise.js',
  'js/screens/friend-pages.js',
  'js/screens/settings.js',
  'js/screens/today.js',
  'js/screens/trophies.js',
  'js/screens/week.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    try {
      const program = await (await cache.match('data/program.json')).json();
      const media = [
        ...program.exercises.flatMap((e) => e.media_frames || []),
        ...program.cardio_types.flatMap((c) => c.media_frames || []),
      ];
      await Promise.allSettled(media.map((url) => cache.add(url)));
    } catch { /* images are also cached on first view */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Apps Script, Spotify: always network

  if (req.mode === 'navigate') {
    // Any navigation (including ?code=... from the Spotify login) gets the cached shell.
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put('index.html', fresh.clone());
        return fresh;
      } catch {
        return (await cache.match('index.html')) || (await cache.match('./'));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  })());
});
