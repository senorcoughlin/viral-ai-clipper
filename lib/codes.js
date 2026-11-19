// On-site redeem codes ("Have a code?"). Separate from Stripe promotion codes.
// Built-in codes live in CODES below; more can be added or disabled at runtime via Redis
// (hash `codes:defs`, managed with /api/codes/admin) without a deploy. Redis entries override built-ins.
import crypto from 'crypto';
import { kvEnabled, kvCommand } from './kv';

// reward: { type: 'pro', days } | { type: 'credits', n }. maxUses: total redemptions allowed (null = unlimited).
// expiresAt: ISO date or null. active: false disables the code.
export const CODES = {
  NATHANRULES: { reward: { type: 'pro', days: 31 }, maxUses: null, expiresAt: null, active: true, note: 'Owner code: free month of Pro' },
};

export const normCode = (c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 40);
const eh = (e) => crypto.createHash('sha256').update(String(e || '').trim().toLowerCase()).digest('hex').slice(0, 32);
export const K = {
  defs: 'codes:defs',
  uses: (c) => `codes:uses:${c}`,
  red: (c) => `codes:red:${c}`, // HASH emailHash -> JSON redemption
  log: 'codes:log',             // LIST of JSON redemptions (newest first)
};

export function rewardText(r) {
  if (!r) return '';
  if (r.type === 'pro') return `${r.days} days of Pro (no renewal)`;
  if (r.type === 'credits') return `${r.n} credits`;
  return r.type;
}

export async function getCode(code) {
  const c = normCode(code);
  if (!c) return null;
  let def = CODES[c] ? { ...CODES[c] } : null;
  if (kvEnabled) {
    const raw = await kvCommand(['HGET', K.defs, c]).catch(() => null);
    if (raw) { try { def = { ...(def || {}), ...JSON.parse(raw) }; } catch {} }
  }
  return def ? { code: c, ...def } : null;
}

export async function listCodes() {
  const out = Object.fromEntries(Object.entries(CODES).map(([k, v]) => [k, { ...v, source: 'built-in' }]));
  if (kvEnabled) {
    const flat = (await kvCommand(['HGETALL', K.defs]).catch(() => [])) || [];
    for (let i = 0; i < flat.length; i += 2) { try { out[flat[i]] = { ...(out[flat[i]] || {}), ...JSON.parse(flat[i + 1]), source: out[flat[i]] ? 'built-in + override' : 'redis' }; } catch {} }
    for (const k of Object.keys(out)) out[k].uses = Number(await kvCommand(['GET', K.uses(k)]).catch(() => 0)) || 0;
  }
  return out;
}

export async function setCodeDef(code, def) {
  const c = normCode(code);
  if (!/^[A-Z0-9_-]{3,40}$/.test(c)) throw new Error('Code must be 3-40 letters, numbers, - or _');
  const r = def.reward;
  if (r && !((r.type === 'pro' && r.days > 0 && r.days <= 366) || (r.type === 'credits' && r.n > 0 && r.n <= 10000))) throw new Error('Bad reward');
  const prev = (await getCode(c)) || {};
  const next = { reward: r || prev.reward, maxUses: def.maxUses ?? prev.maxUses ?? null, expiresAt: def.expiresAt ?? prev.expiresAt ?? null, active: def.active ?? prev.active ?? true, note: def.note ?? prev.note ?? '' };
  if (!next.reward) throw new Error('A new code needs a reward');
  await kvCommand(['HSET', K.defs, c, JSON.stringify(next)]);
  return { code: c, ...next };
}

// Validates and claims a redemption. `grant(email, reward)` applies the reward. Returns { ok, code, reward } or { ok:false, status, error }.
export async function redeem(codeInput, email, grant, now = Date.now()) {
  if (!kvEnabled) return { ok: false, status: 503, error: 'Codes are unavailable right now. Please try again later.' };
  const def = await getCode(codeInput);
  const bad = { ok: false, status: 400, error: "That code isn't valid. Check the spelling and try again." };
  if (!def || def.active === false) return bad;
  if (def.expiresAt && now > Date.parse(def.expiresAt)) return { ok: false, status: 400, error: 'That code has expired.' };
  const c = def.code;
  const who = eh(email);
  const row = { code: c, email: String(email).toLowerCase(), reward: def.reward, at: now };
  const first = Number(await kvCommand(['HSETNX', K.red(c), who, JSON.stringify(row)]));
  if (!first) return { ok: false, status: 409, error: 'This account has already used that code.' };
  if (def.maxUses != null) {
    const n = Number(await kvCommand(['INCR', K.uses(c)]));
    if (n > Number(def.maxUses)) {
      await kvCommand(['DECR', K.uses(c)]); await kvCommand(['HDEL', K.red(c), who]);
      return { ok: false, status: 410, error: 'That code has reached its limit.' };
    }
  } else {
    await kvCommand(['INCR', K.uses(c)]);
  }
  try {
    const applied = await grant(row.email, def.reward);
    const full = { ...row, ...applied };
    await kvCommand(['HSET', K.red(c), who, JSON.stringify(full)]);
    await kvCommand(['LPUSH', K.log, JSON.stringify(full)]);
    await kvCommand(['LTRIM', K.log, '0', '4999']);
    return { ok: true, code: c, reward: def.reward, ...applied };
  } catch (e) {
    await kvCommand(['HDEL', K.red(c), who]); await kvCommand(['DECR', K.uses(c)]);
    throw e;
  }
}

// Removes one account's redemption (e.g. a test). Does not change the reward itself.
export async function removeRedemption(code, email) {
  const c = normCode(code), who = eh(email);
  const n = Number(await kvCommand(['HDEL', K.red(c), who]));
  if (n) await kvCommand(['DECR', K.uses(c)]);
  const rows = (await kvCommand(['LRANGE', K.log, '0', '4999'])) || [];
  let removed = 0;
  for (const r of rows) { try { const j = JSON.parse(r); if (j.code === c && j.email === String(email).toLowerCase()) removed += Number(await kvCommand(['LREM', K.log, '0', r])); } catch {} }
  return { removed: !!n, logRemoved: removed };
}

export async function listRedemptions(n = 200) {
  const rows = (await kvCommand(['LRANGE', K.log, '0', String(n - 1)]).catch(() => [])) || [];
  return rows.map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
}
