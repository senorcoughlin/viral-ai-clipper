// Signed, httpOnly session cookie that carries the buyer's identity.
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, SESSION_SECRET)).
// `v` (verified) is true only when the email was proven by a Stripe checkout session
// (or by an account that was previously linked to one). Paid entitlements require v.
import crypto from 'crypto';

export const SESSION_COOKIE = 'vac_session';
const MAX_AGE = 60 * 60 * 24 * 180; // 180 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET is not configured');
  return s;
}
const b64 = (buf) => Buffer.from(buf).toString('base64url');
const mac = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

export function signSession({ email, verified }) {
  const payload = b64(JSON.stringify({ e: String(email).trim().toLowerCase(), v: !!verified, iat: Date.now() }));
  return `${payload}.${mac(payload)}`;
}

export function verifySession(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const want = Buffer.from(mac(payload));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!d?.e || !String(d.e).includes('@')) return null;
    if (Date.now() - Number(d.iat || 0) > MAX_AGE * 1000) return null;
    return { email: d.e, verified: !!d.v };
  } catch { return null; }
}

export function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export function getSession(request) {
  return verifySession(readCookie(request, SESSION_COOKIE));
}

// Email that may use paid entitlements (Pro / credits), or null.
export function paidEmail(request) {
  const s = getSession(request);
  return s?.verified ? s.email : null;
}

export function setSessionCookie(res, { email, verified }) {
  res.cookies.set(SESSION_COOKIE, signSession({ email, verified }), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  });
  return res;
}

export function clearSessionCookie(res) {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
