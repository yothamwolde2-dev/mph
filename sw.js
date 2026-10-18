// MPH service worker. The app opens instantly from the copy kept on the device,
// and quietly fetches the newest version in the background for next time.
const CACHE = 'mph-0.8.1';
const V = '?v=0.8.1';
const SHELL = ['./', './index.html', './css/app.css' + V, './js/app.js' + V, './js/core.js' + V, './js/store.js' + V, './js/views.js' + V, './js/reader.js' + V, './js/content.js' + V, './js/lang.js' + V, './js/book.js' + V, './js/webrun.js' + V, './js/plan.js' + V, './content/index.bin' + V, './content/zh-hsk2.bin?v=1', './content/zh-hsk3.bin?v=1', './content/de-a1.bin?v=2', './content/om-l1.bin?v=2', './content/book-cm1.bin?v=1', './content/book-coffee.bin?v=1', './content/book-dahua.bin?v=3', './content/book-integration.bin?v=1', './content/book-sec-1.bin?v=1', './content/book-sec-2.bin?v=1', './content/book-ib-1.bin?v=1', './content/book-ib-2.bin?v=1', './content/book-pm-1.bin?v=1', './content/book-pm-2.bin?v=1', './content/book-fin-1.bin?v=1', './content/book-fin-2.bin?v=1', './content/book-it-1.bin?v=1', './content/book-it-2.bin?v=1', './content/book-ai-1.bin?v=1', './content/book-ai-2.bin?v=1', './js/supabase.js', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png', './fonts/montserrat-latin-500-normal.woff2', './fonts/montserrat-latin-600-normal.woff2', './fonts/montserrat-latin-700-normal.woff2', './fonts/montserrat-latin-800-normal.woff2', './fonts/montserrat-latin-900-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('mph-0') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const isPage = e.request.mode === 'navigate';
  e.respondWith(caches.open(CACHE).then(async c => {
    const key = isPage ? './index.html' : e.request;
    const hit = await c.match(key, { ignoreSearch: false });
    const fresh = fetch(e.request).then(r => { if (r && r.ok) c.put(key, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(fresh); return hit; }
    const r = await fresh; return r || (isPage ? c.match('./index.html') : Response.error());
  }));
});
