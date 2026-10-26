// Read-only views for the guest admin panel. Never returns env values or keys.
import { kvCommand } from './kv';
import { loadRuns } from './metrics';
import { renderioUsed, RENDERIO_CAP } from './capacity';
import { nyDay, FREE_DAILY_LIMIT, PRO_DAILY_CEILING } from './ratelimit';
import { getSiteConfig, FLAGS } from './siteconfig';
import { readAudit } from './adminauth';

async function scan(match, max = 500) {
  const out = []; let cursor = '0';
  for (let i = 0; i < 40 && out.length < max; i++) {
    const r = await kvCommand(['SCAN', cursor, 'MATCH', match, 'COUNT', '500']);
    cursor = String(r?.[0] ?? '0'); out.push(...(r?.[1] || []));
    if (cursor === '0') break;
  }
  return out.slice(0, max);
}
async function mget(keys) {
  if (!keys.length) return [];
  const out = [];
  for (let i = 0; i < keys.length; i += 100) out.push(...((await kvCommand(['MGET', ...keys.slice(i, i + 100)])) || []));
  return out;
}
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };

export async function viewUsers(q = '') {
  const keys = await scan('ent:*', 1000);
  const recs = (await mget(keys)).map(j).filter(r => r?.email);
  const ql = String(q).trim().toLowerCase();
  const list = recs.filter(r => !ql || r.email.includes(ql)).sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 200);
  const crypto = await import('crypto');
  const h = (e) => crypto.createHash('sha256').update(e).digest('hex').slice(0, 32);
  const credits = await mget(list.map(r => `credits:${h(r.email)}`));
  return {
    total: recs.length, pro: recs.filter(r => r.pro).length,
    users: list.map((r, i) => ({ email: r.email, pro: !!r.pro, credits: credits[i] != null ? Number(credits[i]) : Number(r.credits || 0), stripeCustomer: !!r.customerId, updated: r.updated || null })),
  };
}

export async function viewStats() {
  const runs = await loadRuns(2000);
  const now = Date.now(), DAY = 86400000;
  const in24 = runs.filter(r => now - (r.at || 0) < DAY), in7 = runs.filter(r => now - (r.at || 0) < 7 * DAY);
  const sum = (a, f) => a.reduce((s, r) => s + (f(r) || 0), 0);
  const today = nyDay();
  const dayKeys = await scan(`rl:day:*:${today}`, 1000);
  const counts = await mget(dayKeys);
  const limits = dayKeys.map((k, i) => { const m = k.match(/^rl:day:([a-z]+):(.+):\d{4}-\d{2}-\d{2}$/); return m ? { tier: m[1], id: m[2], used: Number(counts[i] || 0) } : null; }).filter(Boolean).sort((a, b) => b.used - a.used).slice(0, 100);
  return {
    runs24h: in24.length, clips24h: sum(in24, r => (r.clips || []).length), failed24h: sum(in24, r => r.failed),
    runs7d: in7.length, clips7d: sum(in7, r => (r.clips || []).length), failed7d: sum(in7, r => r.failed),
    avgSec24h: in24.length ? Math.round(sum(in24, r => r.ms) / in24.length / 1000) : null,
    renderio: { used: await renderioUsed().catch(() => null), cap: RENDERIO_CAP },
    limits: { freePerDay: FREE_DAILY_LIMIT, proPerDay: PRO_DAILY_CEILING, today, usage: limits },
  };
}

export async function viewErrors() {
  const lastKeys = await scan('errors:last:*', 200);
  const last = (await mget(lastKeys)).map((v, i) => ({ route: lastKeys[i].slice('errors:last:'.length), ...(j(v) || {}) }));
  const day = new Date().toISOString().slice(0, 10);
  const cKeys = last.map(e => `errors:${e.route}:${day}`);
  const c = await mget(cKeys);
  const errors = last.map((e, i) => ({ ...e, todayUtc: Number(c[i] || 0) })).sort((a, b) => (b.at || 0) - (a.at || 0));
  const jobKeys = await scan('job:*:meta', 300);
  const jobs = (await mget(jobKeys)).map((v, i) => {
    const m = j(v) || {};
    return { id: jobKeys[i].slice(4, -5), tier: m.tier || null, startedAt: m.startedAt || null, hb: m.hb || null, done: !!m.done, continued: !!m.continued, error: m.error ? String(m.error).slice(0, 200) : null, lost: !m.done && m.hb && Date.now() - m.hb > 75000 };
  }).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)).slice(0, 60);
  const runs = (await loadRuns(30)).map(r => ({ at: r.at, sec: Math.round((r.ms || 0) / 1000), video: r.video, requested: r.requested, made: (r.clips || []).length, failed: r.failed || 0, tier: r.tier, cached: !!r.cached }));
  return { errors, jobs, runs };
}

export async function viewSite() {
  const c = await getSiteConfig(true);
  return { banner: c.banner, flags: c.flags, flagInfo: FLAGS };
}
export async function viewAudit() { return { audit: await readAudit(200) }; }
