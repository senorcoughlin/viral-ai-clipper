// First-party funnel counter: ev:<YYYY-MM-DD ET>:<name> in Redis, plus ev:<day>:<name>:u (unique IPs, HyperLogLog).
import { kvPipeline, kvEnabled, kvHealthy } from '../../../lib/kv';
import { recordCity } from '../../../lib/geo';

export const runtime = 'nodejs';
const ALLOWED = new Set(['landing_view', 'url_input_focus', 'url_pasted', 'generate_click', 'generate_success', 'generate_error', 'spin_view', 'spin_click', 'spin_win', 'sample_click', 'paste_click', 'generate_blocked', 'page_view', 'sticky_cta', 'bottom_cta', 'clip_download']);
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|curl|wget|python|node-fetch|axios/i;

// Per-instance state that keeps this endpoint cheap on Upstash (every command is billed):
//  - the burst limiter is in memory (it used to cost 2-3 Redis commands per event),
//  - TTLs are set once per key per instance (they used to be re-sent on every event),
//  - the counter and the unique-visitor sketch go out as one pipeline of 2 commands.
const burst = new Map();
const ttlDone = new Set();
function overBurst(ip) {
  const now = Date.now(), min = Math.floor(now / 60000);
  const hit = burst.get(ip);
  if (!hit || hit.min !== min) {
    if (burst.size > 5000) burst.clear();
    burst.set(ip, { min, n: 1 });
    return false;
  }
  hit.n += 1;
  return hit.n > 30;
}

export async function POST(req) {
  try {
    const ua = req.headers.get('user-agent') || '';
    if (!ua || BOT.test(ua) || !kvEnabled || !kvHealthy()) return new Response(null, { status: 204 });
    const { name } = await req.json().catch(() => ({}));
    if (!ALLOWED.has(name)) return new Response(null, { status: 204 });
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    if (overBurst(ip)) return new Response(null, { status: 204 });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    const key = `ev:${day}:${name}`;
    const cmds = [['INCR', key], ['PFADD', key + ':u', ip]];
    if (!ttlDone.has(key)) cmds.push(['EXPIRE', key, String(86400 * 120)], ['EXPIRE', key + ':u', String(86400 * 120)]);
    await kvPipeline(cmds);
    if (cmds.length > 2) { if (ttlDone.size > 2000) ttlDone.clear(); ttlDone.add(key); }
    // City stats (page views and Generate clicks) from Vercel's geo headers.
    if (name === 'landing_view' || name === 'page_view') await recordCity('view', { headers: req.headers, ip, ua, day }).catch(() => {});
    else if (name === 'generate_click') await recordCity('gen', { headers: req.headers, ip, ua, day }).catch(() => {});
  } catch {}
  return new Response(null, { status: 204 });
}
