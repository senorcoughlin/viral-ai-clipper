// Uploaded videos live in the (private) Vercel Blob store. RenderIO can't send our
// Blob token, so it fetches them through /api/media with a short-lived HMAC signature.
import crypto from 'crypto';

const BLOB_HOST = /\.blob\.vercel-storage\.com$/i;
const sign = (u, x) => crypto.createHmac('sha256', process.env.SESSION_SECRET + ':media').update(`${u}|${x}`).digest('base64url');

export function isBlobUrl(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && BLOB_HOST.test(u.hostname); } catch { return false; }
}

export function toFetchable(url, ttlSec = 3 * 3600) {
  if (!isBlobUrl(url)) return url;
  const x = Math.floor(Date.now() / 1000) + ttlSec;
  return `https://viralaiclipper.com/api/media?u=${encodeURIComponent(url)}&x=${x}&s=${sign(url, x)}`;
}

export function verifyMedia(u, x, s) {
  if (!isBlobUrl(u) || !x || !s || Number(x) < Date.now() / 1000) return false;
  const want = Buffer.from(sign(u, x));
  const got = Buffer.from(String(s));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
