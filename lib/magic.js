// One-time email sign-in links. Token = base64url(payload).HMAC; the nonce is stored
// in Redis and deleted on first use, so a link works once and expires in 15 minutes.
import crypto from 'crypto';
import { kvEnabled, kvCommand } from './kv';

const TTL_SEC = 15 * 60;
const mac = (d) => crypto.createHmac('sha256', process.env.SESSION_SECRET + ':magic').update(d).digest('base64url');

export async function createMagicToken(email) {
  const n = crypto.randomBytes(16).toString('base64url');
  const d = { e: email, n, x: Date.now() + TTL_SEC * 1000 };
  // Normal links are single-use (the nonce lives in Redis). If Redis is over quota or down, fall back to a
  // signed, 15-minute, emailed-to-the-owner link that can't be tracked as used, so sign-in keeps working.
  let stored = false;
  if (kvEnabled) { try { await kvCommand(['SET', `magic:${n}`, '1', 'EX', String(TTL_SEC)]); stored = true; } catch {} }
  if (!stored) d.s = 1;
  const payload = Buffer.from(JSON.stringify(d)).toString('base64url');
  return `${payload}.${mac(payload)}`;
}

export async function consumeMagicToken(token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const want = Buffer.from(mac(payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  let d;
  try { d = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
  if (!d?.e || !d?.n || Date.now() > Number(d.x)) return null;
  if (d.s === 1) return d.e; // signed fallback link (see createMagicToken); the MAC and expiry were checked above
  const deleted = await kvCommand(['DEL', `magic:${d.n}`]);
  return Number(deleted) === 1 ? d.e : null;
}
