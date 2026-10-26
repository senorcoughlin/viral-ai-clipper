// Admin-editable site banner + feature flags (Redis). Read paths are cached briefly.
import { kvEnabled, kvCommand } from './kv';

export const FLAGS = {
  pause_generation: 'Pause new clip generation (shows a "back soon" message)',
  pause_signin: 'Pause email sign-in links',
  hide_spin: 'Hide the daily spin / gift wheel',
};
let cache = { at: 0, v: null };

export async function getSiteConfig(fresh = false) {
  if (!fresh && cache.v && Date.now() - cache.at < 15000) return cache.v;
  let banner = null, flags = {};
  if (kvEnabled) {
    try { const b = await kvCommand(['GET', 'site:banner']); banner = b ? JSON.parse(b) : null; } catch {}
    try { const f = await kvCommand(['GET', 'site:flags']); flags = f ? JSON.parse(f) : {}; } catch {}
  }
  const clean = {}; for (const k of Object.keys(FLAGS)) clean[k] = !!flags[k];
  cache = { at: Date.now(), v: { banner: banner?.text ? banner : null, flags: clean } };
  return cache.v;
}
export async function flagOn(name) { return !!(await getSiteConfig()).flags[name]; }
export async function setBanner(text, tone = 'info') {
  const t = String(text || '').slice(0, 280).trim();
  if (!t) await kvCommand(['DEL', 'site:banner']);
  else await kvCommand(['SET', 'site:banner', JSON.stringify({ text: t, tone: ['info', 'warn', 'promo'].includes(tone) ? tone : 'info', at: Date.now() })]);
  cache = { at: 0, v: null };
}
export async function setFlag(name, on) {
  if (!FLAGS[name]) throw new Error('unknown flag');
  const cur = (await getSiteConfig(true)).flags; cur[name] = !!on;
  await kvCommand(['SET', 'site:flags', JSON.stringify(cur)]);
  cache = { at: 0, v: null };
}
