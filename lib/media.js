// Uploaded videos live in the (private) Vercel Blob store.
// - RenderIO / ffmpeg get a short-lived presigned Blob URL (toRenderUrl): they read straight
//   from Blob, so the bytes are no longer streamed through one of our functions (which billed
//   them twice as Fast Origin Transfer). The store stays private; the URL is scoped to one
//   pathname, GET only, and expires.
// - /api/media (toFetchable) remains for long-lived links (edited clips the user keeps) and
//   as the fallback if presigning ever fails.
import crypto from 'crypto';
import { issueSignedToken, presignUrl } from '@vercel/blob';

const BLOB_HOST = /\.blob\.vercel-storage\.com$/i;
const PRIVATE_HOST = /\.private\.blob\.vercel-storage\.com$/i;
const sign = (u, x) => crypto.createHmac('sha256', process.env.SESSION_SECRET + ':media').update(`${u}|${x}`).digest('base64url');

export function isBlobUrl(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && BLOB_HOST.test(u.hostname); } catch { return false; }
}
export function isPrivateBlobUrl(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && PRIVATE_HOST.test(u.hostname); } catch { return false; }
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

// 45 min covers the longest render (one invocation is capped at 300s; RenderIO may queue a bit).
export const PRESIGN_TTL_SEC = Number(process.env.BLOB_PRESIGN_TTL_SEC || 45 * 60);
const memo = new Map(); // `${op}|${pathname}` -> { url, until }; saves a signed-token call per reuse

export async function presignBlob(url, { ttlSec = PRESIGN_TTL_SEC, op = 'get' } = {}) {
  const src = new URL(url);
  const pathname = decodeURIComponent(src.pathname.replace(/^\//, ''));
  const key = `${op}|${pathname}`;
  const hit = memo.get(key);
  // Reuse only while at least half the requested lifetime is left.
  if (hit && hit.until - Date.now() > ttlSec * 500) return hit.url;
  const validUntil = Date.now() + ttlSec * 1000;
  const tok = await issueSignedToken({ pathname, operations: [op], validUntil });
  const { presignedUrl } = await presignUrl(tok, { operation: op, pathname, validUntil, access: 'private' });
  // The token is for our own store; a URL from another store can't be presigned with it.
  if (new URL(presignedUrl).host !== src.host) throw new Error('blob belongs to another store');
  if (memo.size > 500) for (const [k, v] of memo) if (v.until < Date.now() + 60000 || memo.size > 400) memo.delete(k);
  memo.set(key, { url: presignedUrl, until: validUntil });
  return presignedUrl;
}

// A URL RenderIO's (or a local) ffmpeg can read directly, for the length of a render job.
export async function toRenderUrl(url, ttlSec = PRESIGN_TTL_SEC) {
  if (!isBlobUrl(url)) return url;
  if (!isPrivateBlobUrl(url)) return url; // public blobs are fetchable as-is
  if (process.env.BLOB_PRESIGN_DISABLE === '1') return toFetchable(url);
  try { return await presignBlob(url, { ttlSec }); }
  catch (e) { console.warn('blob presign failed; using /api/media', e?.message); return toFetchable(url); }
}
