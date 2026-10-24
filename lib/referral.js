// Referral program: each verified user gets a short code (refcode:<code> -> {h,email}).
// When a brand-new user verifies their email with a ref cookie from someone else,
// both get REFERRAL_CREDITS credits, once per new user, capped per referrer.
import crypto from 'crypto';
import { kvEnabled, kvCommand } from './kv';
import { addCredits } from './billing';

export const REFERRAL_CREDITS = 10;
export const REFERRAL_CAP = 50;
export const REF_COOKIE = 'vac_ref';
const norm = (e) => String(e || '').trim().toLowerCase();
const h = (e) => crypto.createHash('sha256').update(norm(e)).digest('hex').slice(0, 32);
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
export const validCode = (c) => typeof c === 'string' && /^[a-z0-9]{6,10}$/.test(c);

export async function getOrCreateCode(email) {
  if (!kvEnabled || !norm(email).includes('@')) return null;
  const mine = `refcode_by:${h(email)}`;
  const existing = await kvCommand(['GET', mine]);
  if (existing) return existing;
  for (let i = 0; i < 5; i++) {
    const bytes = crypto.randomBytes(7);
    const code = Array.from(bytes, b => ALPHA[b % ALPHA.length]).join('');
    const ok = await kvCommand(['SET', `refcode:${code}`, JSON.stringify({ h: h(email), email: norm(email) }), 'NX']);
    if (ok === 'OK') {
      const set = await kvCommand(['SET', mine, code, 'NX']);
      if (set === 'OK') return code;
      await kvCommand(['DEL', `refcode:${code}`]); // lost a race; use the winner's code
      return kvCommand(['GET', mine]);
    }
  }
  return null;
}

export async function referralStats(code) {
  if (!kvEnabled || !validCode(code)) return { count: 0 };
  return { count: Number(await kvCommand(['GET', `refcount:${code}`])) || 0 };
}

// Returns true when both accounts were credited. Call only for a first verified sign-in.
export async function applyReferral(newEmail, code) {
  if (!kvEnabled || !validCode(code) || !norm(newEmail).includes('@')) return false;
  const raw = await kvCommand(['GET', `refcode:${code}`]);
  if (!raw) return false;
  let owner; try { owner = JSON.parse(raw); } catch { return false; }
  const nh = h(newEmail);
  if (!owner?.email || owner.h === nh) return false; // self-referral
  const claimed = await kvCommand(['SET', `refby:${nh}`, code, 'NX']);
  if (claimed !== 'OK') return false; // already referred once
  const n = Number(await kvCommand(['INCR', `refcount:${code}`]));
  if (n > REFERRAL_CAP) { await kvCommand(['DECR', `refcount:${code}`]); return false; }
  await addCredits(newEmail, REFERRAL_CREDITS, `ref:new:${nh}`);
  await addCredits(owner.email, REFERRAL_CREDITS, `ref:owner:${nh}`);
  return true;
}
