// MPH service worker: the app opens even without a connection, and always fetches the newest version when online.
const CACHE = 'mph-0.1.0';
const SHELL = ['./', './index.html', './css/app.css?v=0.1.0', './js/app.js?v=0.1.0', './js/core.js', './js/store.js', './js/views.js', './js/supabase.js', './manifest.webmanifest', './icons/icon-192.png', './fonts/montserrat-latin-500-normal.woff2', './fonts/montserrat-latin-800-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
