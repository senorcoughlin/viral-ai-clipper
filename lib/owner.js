// Identity for per-user data: signed session email, else a random anon id cookie.
import crypto from 'crypto';
import { getSession, readCookie } from './session';

export const ANON_COOKIE = 'vac_anon';

export function ownerKey(request) {
  const s = getSession(request);
  if (s?.email) return { key: 'email:' + s.email, anonNew: null };
  const a = readCookie(request, ANON_COOKIE);
  if (a && /^[a-f0-9]{32}$/.test(a)) return { key: 'anon:' + a, anonNew: null };
  const id = crypto.randomBytes(16).toString('hex');
  return { key: 'anon:' + id, anonNew: id };
}

export function withAnon(res, anonNew) {
  if (anonNew) res.cookies.set(ANON_COOKIE, anonNew, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return res;
}
