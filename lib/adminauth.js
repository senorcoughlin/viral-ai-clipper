// Guest admin account: one username + scrypt password hash in env (ADMIN_GUEST_USER,
// ADMIN_GUEST_PASS_HASH). Separate from customer sign-in. Sessions, lockouts and the
// audit log live in Redis; without Redis the admin is disabled (fail closed).
// Kill switch: set ADMIN_GUEST_DISABLED=1 to refuse logins and end all sessions.
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { kvEnabled, kvCommand } from './kv';
import { clientIp } from './ratelimit';

export const ADMIN_COOKIE = 'vac_admin';
const SESSION_SEC = 60 * 60 * 8;
const IP_MAX_FAILS = 5, IP_LOCK_SEC = 15 * 60;
const ACCT_MAX_FAILS = 10, ACCT_LOCK_SEC = 15 * 60; // account-wide: catches attackers rotating IPs
const ATTEMPTS_PER_WINDOW = 10, ATTEMPT_WINDOW_SEC = 5 * 60;
const AUDIT_KEY = 'adm:audit';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const ipTag = (ip) => sha('adm-ip:' + ip).slice(0, 16);

export function adminDisabled() {
  const k = String(process.env.ADMIN_GUEST_DISABLED || '').trim().toLowerCase();
  if (k && k !== '0' && k !== 'false' && k !== 'no') return true;
  return !process.env.ADMIN_GUEST_USER || !process.env.ADMIN_GUEST_PASS_HASH || !kvEnabled;
}

function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Hash format: scrypt:N:r:p:salt(base64url):hash(base64url)
function checkPassword(pw) {
  try {
    const [alg, N, r, p, salt, hash] = String(process.env.ADMIN_GUEST_PASS_HASH).split(':');
    if (alg !== 'scrypt') return false;
    const want = Buffer.from(hash, 'base64url');
    const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64url'), want.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  } catch { return false; }
}

export async function audit(request, action, detail = {}) {
  try {
    const row = { at: Date.now(), user: process.env.ADMIN_GUEST_USER || 'Guest', ip: request ? clientIp(request) : '', action, detail };
    await kvCommand(['LPUSH', AUDIT_KEY, JSON.stringify(row).slice(0, 4000)]);
    await kvCommand(['LTRIM', AUDIT_KEY, '0', '4999']);
  } catch {}
}
export async function readAudit(n = 200) {
  const rows = (await kvCommand(['LRANGE', AUDIT_KEY, '0', String(n - 1)]).catch(() => [])) || [];
  return rows.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
}

async function incrTtl(key, ttl) {
  const n = Number(await kvCommand(['INCR', key]));
  if (n === 1) await kvCommand(['EXPIRE', key, String(ttl)]);
  return n;
}

export async function login(request, username, password) {
  if (adminDisabled()) return { ok: false, status: 403, error: 'Admin access is disabled.' };
  const ip = ipTag(clientIp(request));
  const ttlIp = Number(await kvCommand(['TTL', `adm:lock:ip:${ip}`]));
  if (ttlIp > 0) { await audit(request, 'login.blocked', { reason: 'ip-locked' }); return { ok: false, status: 429, error: `Too many failed attempts. Try again in ${Math.ceil(ttlIp / 60)} min.`, locked: true }; }
  const ttlAcct = Number(await kvCommand(['TTL', 'adm:lock:acct']));
  if (ttlAcct > 0) { await audit(request, 'login.blocked', { reason: 'account-locked' }); return { ok: false, status: 429, error: `Admin account is locked. Try again in ${Math.ceil(ttlAcct / 60)} min.`, locked: true }; }
  if ((await incrTtl(`adm:att:${ip}`, ATTEMPT_WINDOW_SEC)) > ATTEMPTS_PER_WINDOW) return { ok: false, status: 429, error: 'Too many attempts. Wait a few minutes.' };
  const userOk = safeEq(String(username || '').trim(), process.env.ADMIN_GUEST_USER);
  const passOk = checkPassword(password); // always run (constant-ish timing)
  if (!userOk || !passOk) {
    const fails = await incrTtl(`adm:fail:ip:${ip}`, IP_LOCK_SEC);
    const acct = await incrTtl('adm:fail:acct', ACCT_LOCK_SEC);
    let locked = false;
    if (fails >= IP_MAX_FAILS) { await kvCommand(['SET', `adm:lock:ip:${ip}`, '1', 'EX', String(IP_LOCK_SEC)]); locked = true; }
    if (acct >= ACCT_MAX_FAILS) { await kvCommand(['SET', 'adm:lock:acct', '1', 'EX', String(ACCT_LOCK_SEC)]); locked = true; }
    await audit(request, 'login.fail', { locked });
    return { ok: false, status: locked ? 429 : 401, error: locked ? 'Too many failed attempts. Sign-in is locked for 15 minutes.' : 'Wrong username or password.', locked };
  }
  await kvCommand(['DEL', `adm:fail:ip:${ip}`]);
  const token = crypto.randomBytes(32).toString('base64url');
  await kvCommand(['SET', `adm:sess:${sha(token)}`, JSON.stringify({ at: Date.now(), ip }), 'EX', String(SESSION_SEC)]);
  await audit(request, 'login.ok');
  return { ok: true, token };
}

export function setAdminCookie(res, token) {
  res.cookies.set(ADMIN_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: SESSION_SEC });
  return res;
}
export function clearAdminCookie(res) {
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return res;
}
function cookieToken(request) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(/;\s*/)) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i) === ADMIN_COOKIE) return decodeURIComponent(part.slice(i + 1)); }
  return null;
}
export async function logout(request) {
  const t = cookieToken(request);
  if (t) await kvCommand(['DEL', `adm:sess:${sha(t)}`]).catch(() => {});
  await audit(request, 'logout');
}

// Returns null when the request is an authenticated admin, else a 401/403 response.
// Mutating requests must also carry x-admin-csrf: 1 and a same-origin Origin header.
export async function requireAdmin(request, { write = false } = {}) {
  const deny = (s, e) => NextResponse.json({ error: e }, { status: s, headers: { 'Cache-Control': 'no-store' } });
  if (adminDisabled()) return deny(403, 'Admin access is disabled.');
  const t = cookieToken(request);
  if (!t || t.length > 100) return deny(401, 'Not signed in as admin.');
  const s = await kvCommand(['GET', `adm:sess:${sha(t)}`]).catch(() => null);
  if (!s) return deny(401, 'Admin session expired. Sign in again.');
  if (write) {
    if (request.headers.get('x-admin-csrf') !== '1') return deny(403, 'Missing CSRF header.');
    const origin = request.headers.get('origin');
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    if (origin && host && new URL(origin).host !== host) return deny(403, 'Cross-site request blocked.');
  }
  return null;
}
