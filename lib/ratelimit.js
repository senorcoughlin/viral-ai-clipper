// Server-side usage limits. Uses Upstash/Vercel KV Redis (REST) when its env vars
// are set, otherwise falls back to an in-memory per-instance counter.
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

export const FREE_DAILY_LIMIT = Number(process.env.FREE_DAILY_LIMIT || 3);
// Hard per-IP ceiling for anyone claiming credits (credits are not yet stored server-side).
export const CREDIT_DAILY_CEILING = Number(process.env.CREDIT_DAILY_CEILING || 25);
export const PRO_DAILY_CEILING = Number(process.env.PRO_DAILY_CEILING || 200);
export const BURST_PER_MINUTE = Number(process.env.BURST_PER_MINUTE || 5);

const memory = new Map();

async function redisIncr(key, ttlSec) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['INCR', key], ['EXPIRE', key, String(ttlSec), 'NX']]),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('redis ' + res.status);
  const data = await res.json();
  return Number(data?.[0]?.result || 0);
}

function memoryIncr(key, ttlSec) {
  const now = Date.now();
  const hit = memory.get(key);
  if (!hit || hit.exp < now) {
    memory.set(key, { n: 1, exp: now + ttlSec * 1000 });
    if (memory.size > 5000) for (const [k, v] of memory) if (v.exp < now) memory.delete(k);
    return 1;
  }
  hit.n += 1;
  return hit.n;
}

async function incr(key, ttlSec) {
  if (REDIS_URL && REDIS_TOKEN) {
    try { return await redisIncr(key, ttlSec); } catch (e) { console.warn('ratelimit redis failed, using memory', e?.message); }
  }
  return memoryIncr(key, ttlSec);
}

export function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}

export function limiterBackend() {
  return REDIS_URL && REDIS_TOKEN ? 'redis' : 'memory';
}

// tier: 'free' | 'credits' | 'pro'
export async function checkLimit(ip, tier = 'free') {
  const day = new Date().toISOString().slice(0, 10);
  const minute = Math.floor(Date.now() / 60000);
  const burst = await incr(`rl:burst:${ip}:${minute}`, 70);
  if (burst > BURST_PER_MINUTE) {
    return { ok: false, status: 429, message: 'Too many requests. Wait a minute and try again.' };
  }
  const cap = tier === 'pro' ? PRO_DAILY_CEILING : tier === 'credits' ? CREDIT_DAILY_CEILING : FREE_DAILY_LIMIT;
  const used = await incr(`rl:day:${tier}:${ip}:${day}`, 60 * 60 * 26);
  if (used > cap) {
    return {
      ok: false,
      status: 429,
      message: tier === 'free'
        ? `You've used your ${FREE_DAILY_LIMIT} free generations today. Upgrade to Pro or buy credits to keep going.`
        : 'Daily limit reached. Try again tomorrow.',
      limitReached: true,
    };
  }
  return { ok: true, used, cap };
}
