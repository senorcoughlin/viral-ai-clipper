export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Downloads with a readable filename.
// - RenderIO files: proxied here with Content-Disposition: attachment, because renderio.dev
//   sends no CORS/attachment headers and cross-origin <a download> names are ignored.
// - Public Blob files: 302 to Blob's own attachment link (?download=1), so the bytes go
//   straight from Blob to the user instead of through this function.
const RENDERIO = /^https:\/\/renderio\.dev\/api\/media\//;
const PUBLIC_BLOB = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//;
const safeName = (n) => {
  const base = String(n || '').replace(/\.mp4$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
  return (base || `viral-clip-${Date.now()}`) + '.mp4';
};

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const u = p.get('u') || '';
  if (PUBLIC_BLOB.test(u)) {
    const to = new URL(u); to.searchParams.set('download', '1');
    return new Response(null, { status: 302, headers: { location: to.toString(), 'cache-control': 'private, no-store' } });
  }
  if (!RENDERIO.test(u)) return new Response('Forbidden', { status: 403 });
  const r = await fetch(u, { next: { revalidate: 0 } });
  if (!r.ok || !r.body) return new Response('Clip not available', { status: r.status === 404 ? 404 : 502 });
  const name = safeName(p.get('n'));
  const h = new Headers({
    'content-type': 'video/mp4',
    'content-disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  });
  const len = r.headers.get('content-length'); if (len) h.set('content-length', len);
  return new Response(r.body, { status: 200, headers: h });
}
