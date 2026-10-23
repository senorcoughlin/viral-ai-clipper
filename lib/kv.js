// Minimal Upstash / Vercel KV REST client. Returns null/false when not configured.
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

export const kvEnabled = !!(URL_ && TOKEN);

export async function kvCommand(args) {
  if (!kvEnabled) return null;
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('kv ' + res.status);
  const data = await res.json();
  return data?.result ?? null;
}

export async function kvGetJson(key) {
  try { const v = await kvCommand(['GET', key]); return v ? JSON.parse(v) : null; } catch { return null; }
}

export async function kvSetJson(key, value, ttlSec) {
  try { await kvCommand(['SET', key, JSON.stringify(value), 'EX', String(ttlSec)]); return true; } catch { return false; }
}
