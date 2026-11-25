// Minimal Upstash / Vercel KV REST client. Returns null/false when not configured.
//
// Quota safety: when Upstash answers "max requests limit exceeded" (free-tier monthly cap) or the
// service is unreachable, this instance stops calling it for a short cool-off and fails fast, so
// every caller's existing fallback runs immediately instead of waiting on a doomed request.
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

export const kvEnabled = !!(URL_ && TOKEN);

const TIMEOUT_MS = 4000;
const QUOTA_COOLOFF_MS = 60 * 1000;
const ERROR_COOLOFF_MS = 5 * 1000;
let blockedUntil = 0;
let blockedReason = '';

export const isQuotaError = (e) => !!(e && (e.kvQuota || /max requests limit|quota/i.test(String(e.message || ''))));
// False while this instance is in a cool-off after a quota/outage error (callers can skip optional work).
export function kvHealthy() { return kvEnabled && Date.now() >= blockedUntil; }
export function kvStatus() { return { enabled: kvEnabled, healthy: kvHealthy(), blockedFor: Math.max(0, blockedUntil - Date.now()), reason: blockedReason }; }
export function _resetKvBreakerForTests() { blockedUntil = 0; blockedReason = ''; }

function trip(ms, reason) {
  blockedUntil = Date.now() + ms;
  blockedReason = reason;
}

async function post(url, body) {
  if (Date.now() < blockedUntil) { const e = new Error('kv unavailable (' + blockedReason + ')'); e.kvQuota = blockedReason === 'quota'; e.kvSkipped = true; throw e; }
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    trip(ERROR_COOLOFF_MS, 'unreachable');
    throw new Error('kv unreachable');
  }
  if (!res.ok) {
    let text = '';
    try { text = await res.text(); } catch {}
    if (/max requests limit|max daily request limit/i.test(text)) {
      trip(QUOTA_COOLOFF_MS, 'quota');
      const e = new Error('kv quota exceeded'); e.kvQuota = true; throw e;
    }
    if (res.status >= 500 || res.status === 429) trip(ERROR_COOLOFF_MS, 'http ' + res.status);
    throw new Error('kv ' + res.status);
  }
  return res.json();
}

export async function kvCommand(args) {
  if (!kvEnabled) return null;
  const data = await post(URL_, args);
  if (data && data.error) throw new Error('kv ' + String(data.error).slice(0, 80));
  return data?.result ?? null;
}

// Several commands in one round trip (Upstash /pipeline). Note Upstash still bills each command in it.
// Returns the results array, or null.
export async function kvPipeline(cmds) {
  if (!kvEnabled || !cmds.length) return null;
  const data = await post(URL_.replace(/\/$/, '') + '/pipeline', cmds);
  return Array.isArray(data) ? data.map(r => r?.result ?? null) : null;
}

export async function kvGetJson(key) {
  try { const v = await kvCommand(['GET', key]); return v ? JSON.parse(v) : null; } catch { return null; }
}

export async function kvSetJson(key, value, ttlSec) {
  try { await kvCommand(['SET', key, JSON.stringify(value), 'EX', String(ttlSec)]); return true; } catch { return false; }
}
