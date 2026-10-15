// Service worker: precaches the app shell, the program and all exercise images so the
// app opens and works with no signal. Bump VERSION on every deploy.
const VERSION = 'pk-v18';

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
  'img/avatars/a01.svg',
  'img/avatars/a02.svg',
  'img/avatars/a03.svg',
  'img/avatars/a04.svg',
  'img/avatars/a05.svg',
  'img/avatars/a06.svg',
  'img/avatars/a07.svg',
  'img/avatars/a08.svg',
  'img/avatars/a09.svg',
  'img/avatars/a10.svg',
  'img/avatars/a11.svg',
  'img/avatars/a12.svg',
  'img/avatars/a13.svg',
  'img/avatars/a14.svg',
  'img/avatars/a15.svg',
  'img/avatars/a16.svg',
  'img/avatars/a17.svg',
  'img/avatars/a18.svg',
  'img/avatars/a19.svg',
  'img/avatars/a20.svg',
  'img/avatars/a21.svg',
  'img/avatars/a22.svg',
  'img/avatars/a23.svg',
  'img/avatars/a24.svg',
  'js/achievements.js',
  'js/ai.js',
  'js/app.js',
  'js/charts.js',
  'js/db.js',
  'js/export.js',
  'js/friend.js',
  'js/help.js',
  'js/program.js',
  'js/progression.js',
  'js/recommend.js',
  'js/schema.js',
  'js/settings.js',
  'js/spotify.js',
  'js/stats.js',
  'js/sync.js',
  'js/timer.js',
  'js/ui.js',
  'js/util.js',
  'js/workout.js',
  'js/notify.js',
  'js/screens/exercise.js',
  'js/screens/friend-pages.js',
  'js/screens/home.js',
  'js/screens/inbox.js',
  'js/screens/more.js',
  'js/screens/music.js',
  'js/screens/profile.js',
  'js/screens/progress.js',
  'js/screens/settings.js',
  'js/screens/today.js',
  'js/screens/training-settings.js',
  'js/screens/trophies.js',
  'js/screens/week.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: 'reload' skips the browser HTTP cache (GitHub Pages sends max-age=600), so a new
    // version never stores an older copy of a file.
    const fresh = (url) => new Request(url, { cache: 'reload' });
    await cache.addAll(SHELL.map(fresh));
    try {
      const program = await (await cache.match('data/program.json')).json();
      const media = [
        ...program.exercises.flatMap((e) => e.media_frames || []),
        ...program.cardio_types.flatMap((c) => c.media_frames || []),
      ];
      await Promise.allSettled(media.map((url) => cache.add(fresh(url))));
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
    // The page comes from the same cache version as the scripts (never a newer HTML with older JS).
    // A new deploy installs a new service worker, which takes over and reloads the page once.
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = (await cache.match('index.html')) || (await cache.match('./'));
      if (hit) return hit;
      return fetch(req);
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

// Tapping a lock-screen notice opens the app on the workout.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = all[0];
    if (client) {
      await client.focus();
      client.navigate?.(new URL('./#/hoje', self.registration.scope).href).catch(() => {});
    } else {
      await self.clients.openWindow('./#/hoje');
    }
  })());
});
