// First-party funnel counter: ev:<YYYY-MM-DD ET>:<name> in Redis, plus ev:<day>:<name>:u (unique IPs, HyperLogLog).
import { kvCommand, kvEnabled } from '../../../lib/kv';

export const runtime = 'nodejs';
const ALLOWED = new Set(['landing_view', 'url_input_focus', 'url_pasted', 'generate_click', 'generate_success', 'generate_error', 'spin_view', 'spin_click', 'spin_win', 'sample_click', 'paste_click']);
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|curl|wget|python|node-fetch|axios/i;

export async function POST(req) {
  try {
    const ua = req.headers.get('user-agent') || '';
    if (!ua || BOT.test(ua) || !kvEnabled) return new Response(null, { status: 204 });
    const { name } = await req.json().catch(() => ({}));
    if (!ALLOWED.has(name)) return new Response(null, { status: 204 });
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    const rl = `evrl:${ip}:${Math.floor(Date.now() / 60000)}`;
    const n = await kvCommand(['INCR', rl]);
    if (n === 1) await kvCommand(['EXPIRE', rl, '120']);
    if (n > 30) return new Response(null, { status: 204 });
    const key = `ev:${day}:${name}`;
    await kvCommand(['INCR', key]);
    await kvCommand(['PFADD', key + ':u', ip]);
    await kvCommand(['EXPIRE', key, String(86400 * 120)]);
    await kvCommand(['EXPIRE', key + ':u', String(86400 * 120)]);
  } catch {}
  return new Response(null, { status: 204 });
}
