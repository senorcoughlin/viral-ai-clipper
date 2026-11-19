export const dynamic = 'force-dynamic';
export const maxDuration = 300;
import { verifyMedia, isPrivateBlobUrl, presignBlob } from '../../../lib/media';

// Signed, expiring links to a private uploaded/edited video.
// - Browser playback (no download name): 302 to a short-lived presigned Blob URL, so the
//   bytes go straight from Blob to the viewer instead of through this function.
// - Downloads (`dl`, needs our filename) and non-browser clients (RenderIO, ffmpeg): streamed
//   here as before, Range supported. Blob objects are immutable (random-suffixed paths), so
//   the Blob CDN cache and the browser cache are allowed to serve repeat reads.
async function serve(request, head) {
  const p = new URL(request.url).searchParams;
  const u = p.get('u');
  if (!verifyMedia(u, p.get('x'), p.get('s'))) return new Response('Forbidden', { status: 403 });
  const dl = (p.get('dl') || '').replace(/[^\w.-]+/g, '-').slice(0, 100);
  if (!dl && request.headers.get('sec-fetch-mode') && isPrivateBlobUrl(u) && process.env.BLOB_PRESIGN_DISABLE !== '1') {
    const left = Math.floor(Number(p.get('x')) - Date.now() / 1000);
    const to = await presignBlob(u, { ttlSec: Math.max(60, Math.min(3600, left)), op: head ? 'head' : 'get' }).catch((e) => { console.warn('media presign failed', e?.message); return null; });
    if (to) return new Response(null, { status: 302, headers: { location: to, 'cache-control': 'private, no-store' } });
  }
  const headers = { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` };
  const range = request.headers.get('range');
  if (range) headers.Range = range;
  // No `cache: 'no-store'`: it makes fetch send Cache-Control/Pragma: no-cache, forcing a
  // Blob CDN miss (an origin read) on every request.
  const r = await fetch(u, { method: head ? 'HEAD' : 'GET', headers, next: { revalidate: 0 } });
  const out = new Headers();
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const v = r.headers.get(h); if (v) out.set(h, v);
  }
  if (!out.has('accept-ranges')) out.set('accept-ranges', 'bytes');
  out.set('cache-control', r.ok ? 'private, max-age=86400, immutable' : 'private, no-store');
  if (dl) out.set('content-disposition', `attachment; filename="${dl.endsWith('.mp4') ? dl : dl + '.mp4'}"`);
  return new Response(head ? null : r.body, { status: r.status, headers: out });
}
export const GET = (req) => serve(req, false);
export const HEAD = (req) => serve(req, true);
