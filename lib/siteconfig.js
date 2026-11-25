// Admin-editable site banner + feature flags (Redis). Read paths are cached briefly.
import { kvEnabled, kvCommand } from './kv';

export const FLAGS = {
  pause_generation: 'Pause new clip generation (shows a "back soon" message)',
  pause_signin: 'Pause email sign-in links',
  hide_spin: 'Hide the daily spin / gift wheel',
};
let cache = { at: 0, v: null, err: false };

const TTL_MS = 30000;      // fresh config is reused this long per instance
const ERR_TTL_MS = 60000;  // after a Redis error keep serving the last good config this long before retrying
export async function getSiteConfig(fresh = false) {
  if (!fresh && cache.v && Date.now() - cache.at < (cache.err ? ERR_TTL_MS : TTL_MS)) return cache.v;
  let banner = null, flags = {}, err = false;
  if (kvEnabled) {
    try {
      // One MGET = one billed command (it was two GETs).
      const [b, f] = (await kvCommand(['MGET', 'site:banner', 'site:flags'])) || [];
      banner = b ? JSON.parse(b) : null; flags = f ? JSON.parse(f) : {};
    } catch { err = true; }
  }
  if (err && cache.v) { cache = { at: Date.now(), v: cache.v, err: true }; return cache.v; } // keep the last good banner/flags
  const clean = {}; for (const k of Object.keys(FLAGS)) clean[k] = !!flags[k];
  cache = { at: Date.now(), v: { banner: banner?.text ? banner : null, flags: clean }, err };
  return cache.v;
}
export async function flagOn(name) { return !!(await getSiteConfig()).flags[name]; }
export async function setBanner(text, tone = 'info') {
  const t = String(text || '').slice(0, 280).trim();
  if (!t) await kvCommand(['DEL', 'site:banner']);
  else await kvCommand(['SET', 'site:banner', JSON.stringify({ text: t, tone: ['info', 'warn', 'promo'].includes(tone) ? tone : 'info', at: Date.now() })]);
  cache = { at: 0, v: null, err: false };
}
export async function setFlag(name, on) {
  if (!FLAGS[name]) throw new Error('unknown flag');
  const cur = (await getSiteConfig(true)).flags; cur[name] = !!on;
  await kvCommand(['SET', 'site:flags', JSON.stringify(cur)]);
  cache = { at: 0, v: null, err: false };
}
