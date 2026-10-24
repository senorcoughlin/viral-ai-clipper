// Server-side usage limits. Uses Upstash/Vercel KV Redis (REST) when its env vars
// are set, otherwise falls back to an in-memory per-instance counter.
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

export const FREE_DAILY_LIMIT = Number(process.env.FREE_DAILY_LIMIT || 3);
export const CREDIT_DAILY_CEILING = Number(process.env.CREDIT_DAILY_CEILING || 25);
export const PRO_DAILY_CEILING = Number(process.env.PRO_DAILY_CEILING || 200);
export const BURST_PER_MINUTE = Number(process.env.BURST_PER_MINUTE || 5);

const memory = new Map();

async function redis(cmds) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('redis ' + res.status);
  return res.json();
}

function memoryIncr(key, ttlSec, by = 1) {
  const now = Date.now();
  const hit = memory.get(key);
  if (!hit || hit.exp < now) {
    memory.set(key, { n: by, exp: now + ttlSec * 1000 });
    if (memory.size > 5000) for (const [k, v] of memory) if (v.exp < now) memory.delete(k);
    return by;
  }
  hit.n += by;
  return hit.n;
}

export async function incr(key, ttlSec, by = 1) {
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      const data = await redis([['INCRBY', key, String(by)], ['EXPIRE', key, String(ttlSec), 'NX']]);
      return Number(data?.[0]?.result || 0);
    } catch (e) { console.warn('ratelimit redis failed, using memory', e?.message); }
  }
  return memoryIncr(key, ttlSec, by);
}

async function peek(key) {
  if (REDIS_URL && REDIS_TOKEN) {
    try { const d = await redis([['GET', key]]); return Number(d?.[0]?.result || 0); } catch {}
  }
  const hit = memory.get(key);
  return hit && hit.exp > Date.now() ? hit.n : 0;
}

export function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}

export function limiterBackend() {
  return REDIS_URL && REDIS_TOKEN ? 'redis' : 'memory';
}

// Calendar day in New York so the free allowance resets at local midnight.
export function nyDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const dayKey = (tier, ip) => `rl:day:${tier}:${ip}:${nyDay()}`;
const DAY_TTL = 60 * 60 * 26;

export async function freeUsed(ip) {
  return peek(dayKey('free', ip));
}

// tier: 'free' | 'credits' | 'pro'. Returns { ok, refund } — call refund() to give the slot back.
export async function checkLimit(ip, tier = 'free') {
  const minute = Math.floor(Date.now() / 60000);
  const burst = await incr(`rl:burst:${ip}:${minute}`, 70);
  if (burst > BURST_PER_MINUTE) {
    return { ok: false, status: 429, message: 'Too many requests. Wait a minute and try again.' };
  }
  const cap = tier === 'pro' ? PRO_DAILY_CEILING : tier === 'credits' ? CREDIT_DAILY_CEILING : FREE_DAILY_LIMIT;
  const key = dayKey(tier, ip);
  const used = await incr(key, DAY_TTL);
  const refund = () => incr(key, DAY_TTL, -1).catch(() => {});
  if (used > cap) {
    await refund();
    return {
      ok: false,
      status: 429,
      message: tier === 'free'
        ? `You've used your ${FREE_DAILY_LIMIT} free generations today. Upgrade to Pro or buy credits to keep going.`
        : 'Daily limit reached. Try again tomorrow.',
      limitReached: true,
    };
  }
  return { ok: true, used, cap, refund };
}

// Generic attempt limiter (e.g. logins). Returns true when allowed.
export async function allowAttempt(key, max, windowSec) {
  return (await incr(`rl:att:${key}`, windowSec)) <= max;
}

// Generous per-IP route guard. Returns a 429 Response when over the limit, else null.
export async function routeGuard(request, name, max, windowSec) {
  const ok = await allowAttempt(`route:${name}:${clientIp(request)}`, max, windowSec).catch(() => true);
  return ok ? null : new Response(JSON.stringify({ error: 'Too many requests. Please slow down and try again shortly.' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(windowSec) } });
}
