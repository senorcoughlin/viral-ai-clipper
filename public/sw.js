// Minimal SW: network-first for page navigations only, offline fallback. Never touches API/auth/Stripe/video.
const CACHE = 'vac-offline-v1';
const OFFLINE = '/offline.html';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.add(OFFLINE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || r.mode !== 'navigate') return; // let browser handle everything else
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;
  if (/^\/(api|auth|login|signin|success|cancel)(\/|$)/.test(u.pathname)) return;
  e.respondWith(fetch(r).catch(() => caches.match(OFFLINE)));
});
