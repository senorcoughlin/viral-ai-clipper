export const dynamic = 'force-dynamic';
export const maxDuration = 300;
import { verifyMedia } from '../../../lib/media';

// Streams a private uploaded video to RenderIO (signed, expiring links only). Supports Range.
async function serve(request, head) {
  const p = new URL(request.url).searchParams;
  const u = p.get('u');
  if (!verifyMedia(u, p.get('x'), p.get('s'))) return new Response('Forbidden', { status: 403 });
  const headers = { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` };
  const range = request.headers.get('range');
  if (range) headers.Range = range;
  const r = await fetch(u, { method: head ? 'HEAD' : 'GET', headers, cache: 'no-store' });
  const out = new Headers();
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const v = r.headers.get(h); if (v) out.set(h, v);
  }
  if (!out.has('accept-ranges')) out.set('accept-ranges', 'bytes');
  out.set('cache-control', 'private, no-store');
  return new Response(head ? null : r.body, { status: r.status, headers: out });
}
export const GET = (req) => serve(req, false);
export const HEAD = (req) => serve(req, true);
