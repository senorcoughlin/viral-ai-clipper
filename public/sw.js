// Minimal SW: network-first for page navigations only, offline fallback. Never touches API/auth/Stripe/video.
const CACHE = 'vac-offline-v3';
const OFFLINE = '/offline.html';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.add(OFFLINE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  const u = new URL(r.url);
  // Installed-PWA share target: keep the video in Cache so we never POST a large file to the server.
  if (r.method === 'POST' && u.origin === self.location.origin && u.pathname === '/share') {
    e.respondWith((async () => {
      try {
        const form = await r.formData();
        const file = form.get('video') || form.get('file');
        const q = new URLSearchParams();
        const link = String(form.get('url') || '');
        const text = String(form.get('text') || '');
        const found = link || (text.match(/https?:\/\/\S+/i) || [])[0] || '';
        if (file && typeof file === 'object' && file.size) {
          const cache = await caches.open('vac-share');
          await cache.put('/share/last', new Response(file, { headers: { 'content-type': file.type || 'video/mp4', 'x-filename': file.name || 'shared.mp4' } }));
          q.set('sharefile', '1');
        }
        if (found) q.set('url', found);
        else if (text && !q.has('sharefile')) q.set('text', text);
        return Response.redirect('/' + (q.toString() ? '?' + q.toString() : ''), 303);
      } catch {
        return Response.redirect('/', 303);
      }
    })());
    return;
  }
  if (r.method !== 'GET' || r.mode !== 'navigate') return; // let browser handle everything else
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;
  if (/^\/(api|auth|login|signin|success|cancel)(\/|$)/.test(u.pathname)) return;
  e.respondWith(fetch(r).catch(() => caches.match(OFFLINE)));
});
