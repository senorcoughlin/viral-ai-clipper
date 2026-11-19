// Privacy-friendly city stats from Vercel's edge geo headers. No cookies, no stored IPs:
// visitors are deduped per day with a keyed hash of ip + user agent + day (not reversible,
// and it changes every day), kept only inside a HyperLogLog.
import crypto from 'crypto';
import { kvPipeline } from './kv';

const TTL = String(86400 * 400);
const clean = (v, n) => String(v || '').replace(/[\u0000-\u001f,|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
function dec(v) { try { return decodeURIComponent(String(v || '').replace(/\+/g, ' ')); } catch { return String(v || ''); } }

// "Pooler, GA, US" style label from the request's geo headers ("Unknown" when Vercel has none).
export function cityOf(headers) {
  const get = (k) => (typeof headers.get === 'function' ? headers.get(k) : headers[k]) || '';
  const city = clean(dec(get('x-vercel-ip-city')), 60);
  const region = clean(dec(get('x-vercel-ip-country-region')), 10);
  const country = clean(get('x-vercel-ip-country'), 2).toUpperCase();
  if (!city && !country) return 'Unknown';
  return [city || 'Unknown city', region, country].filter(Boolean).join(', ');
}

export function visitorId(ip, ua, day) {
  const key = (process.env.SESSION_SECRET || 'vac') + ':geo';
  return crypto.createHmac('sha256', key).update(`${ip}|${ua}|${day}`).digest('base64url').slice(0, 16);
}

// kind: 'view' (page view) or 'gen' (Generate click).
export async function recordCity(kind, { headers, ip, ua, day }) {
  const city = cityOf(headers);
  const base = `geo:${day}`;
  const cmds = [['SADD', `${base}:cities`, city], ['EXPIRE', `${base}:cities`, TTL]];
  if (kind === 'view') {
    cmds.push(['HINCRBY', `${base}:views`, city, '1'], ['EXPIRE', `${base}:views`, TTL],
      ['PFADD', `${base}:u:${city}`, visitorId(ip, ua, day)], ['EXPIRE', `${base}:u:${city}`, TTL]);
  } else if (kind === 'gen') {
    cmds.push(['HINCRBY', `${base}:gen`, city, '1'], ['EXPIRE', `${base}:gen`, TTL]);
  } else return;
  await kvPipeline(cmds);
}

const dayList = (from, to) => {
  const out = []; const d = new Date(from + 'T12:00:00Z'); const end = new Date(to + 'T12:00:00Z');
  while (d <= end && out.length < 93) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
};

// { from, to, totals: { visitors, views, generates }, cities: [{ city, visitors, views, generates }], days: {...} }
export async function cityStats(from, to) {
  const days = dayList(from, to);
  const perDay = {};
  const agg = new Map();
  const row = (c) => { if (!agg.has(c)) agg.set(c, { city: c, visitors: 0, views: 0, generates: 0 }); return agg.get(c); };
  for (const day of days) {
    const [cities, views, gen] = (await kvPipeline([['SMEMBERS', `geo:${day}:cities`], ['HGETALL', `geo:${day}:views`], ['HGETALL', `geo:${day}:gen`]])) || [];
    if (!cities?.length) continue;
    const pairs = (a) => { const m = {}; for (let i = 0; i + 1 < (a || []).length; i += 2) m[a[i]] = Number(a[i + 1]) || 0; return m; };
    const v = pairs(views), g = pairs(gen);
    const uniq = (await kvPipeline(cities.map(c => ['PFCOUNT', `geo:${day}:u:${c}`]))) || [];
    perDay[day] = {};
    cities.forEach((c, i) => {
      const d = { visitors: Number(uniq[i]) || 0, views: v[c] || 0, generates: g[c] || 0 };
      perDay[day][c] = d;
      const r = row(c); r.visitors += d.visitors; r.views += d.views; r.generates += d.generates;
    });
  }
  const cities = [...agg.values()].sort((a, b) => b.visitors - a.visitors || b.generates - a.generates);
  const totals = cities.reduce((t, r) => ({ visitors: t.visitors + r.visitors, views: t.views + r.views, generates: t.generates + r.generates }), { visitors: 0, views: 0, generates: 0 });
  return { from, to, note: 'Days are America/New_York. Visitors are unique per city per day, summed across days.', totals, cities, days: perDay };
}
