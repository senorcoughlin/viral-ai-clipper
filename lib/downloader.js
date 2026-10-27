import { kvGetJson, kvSetJson } from './kv';

// Our own yt-dlp downloader service (see /downloader). Enabled when both env vars are set;
// otherwise the app keeps using RenderIO's downloader.
const BASE = (process.env.DOWNLOADER_URL || '').replace(/\/$/, '');
const SECRET = process.env.DOWNLOADER_SECRET || '';
export const downloaderEnabled = !!(BASE && SECRET);

// Resolves to a direct, fetchable mp4 URL or throws. Gives up after timeoutMs.
export async function downloadViaService(url, timeoutMs = 120000) {
  const h = { 'X-Downloader-Secret': SECRET, 'Content-Type': 'application/json' };
  const r = await fetch(`${BASE}/jobs`, { method: 'POST', headers: h, body: JSON.stringify({ url }), cache: 'no-store' });
  if (!r.ok) throw new Error('downloader ' + r.status);
  const { id } = await r.json();
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await new Promise(res => setTimeout(res, 2000));
    const s = await fetch(`${BASE}/jobs/${id}`, { headers: h, cache: 'no-store' }).then(x => x.json()).catch(() => null);
    if (s?.status === 'done' && s.fileUrl) return s.fileUrl;
    if (s?.status === 'error' || s?.status === 'missing') throw new Error(s.error || 'download failed');
  }
  throw new Error('downloader timeout');
}

// Hosted YouTube download API (video-download-api.com / loader.to-compatible). Enabled with
// YT_DOWNLOAD_API_KEY; ~$0.0002 per 720p download. Used when our own service isn't set.
const API_HOST = (process.env.YT_DOWNLOAD_API_HOST || 'https://p.savenow.to').replace(/\/$/, '');
const API_KEY = process.env.YT_DOWNLOAD_API_KEY || '';
export const downloadApiEnabled = !!API_KEY;

export async function downloadViaApi(url, timeoutMs = 120000, opts = {}) {
  const q = new URLSearchParams({ url, format: opts.format || '720', apikey: API_KEY });
  const r = await fetch(`${API_HOST}/ajax/download.php?${q}`, { cache: 'no-store' });
  const j = await r.json().catch(() => null);
  if (!j?.success || !j.id) throw new Error(j?.text || ('download api rejected ' + r.status + ' ' + JSON.stringify(j || {}).replace(/"content":"[^"]*"/, '').slice(0, 200)));
  const progressUrl = j.progress_url || `${API_HOST}/api/progress?id=${encodeURIComponent(j.id)}`;
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await new Promise(res => setTimeout(res, 2500));
    const p = await fetch(progressUrl, { cache: 'no-store' }).then(x => x.json()).catch(() => null);
    if (!p) continue;
    const ok = p.success === 1 || p.success === true || p.success === '1';
    if (ok && p.download_url) return p.download_url;
    if (Number(p.progress) >= 1000 && !ok) throw new Error(p.text || 'download api failed');
  }
  throw new Error('download api timeout');
}

// Pick the best configured YouTube downloader, or null to use RenderIO.
// RapidAPI is tried first when set; if it fails (not subscribed, quota, outage, any error)
// we fall back to the direct download API so YouTube links keep working.
export function youtubeDownloader() {
  if (downloaderEnabled) return downloadViaService;
  if (rapidEnabled && downloadApiEnabled) return downloadWithFallback;
  if (rapidEnabled) return downloadViaRapid;
  if (downloadApiEnabled) return downloadViaApi;
  return null;
}

async function downloadWithFallback(url, timeoutMs = 120000, opts = {}) {
  const t0 = Date.now();
  const done = (via) => (u) => { console.log('yt source ready', { via, format: opts.format, ms: Date.now() - t0 }); return u; };
  if (!(await rapidDown())) {
    try { return done('rapid')(await downloadViaRapid(url, timeoutMs, opts)); } catch (e) {
      console.warn('rapidapi download failed; using direct download api', e?.message);
    }
  }
  return downloadViaApi(url, Math.max(30000, timeoutMs - (Date.now() - t0)), { format: opts.format }).then(done('api'));
}

// Same provider via RapidAPI (preferred when YT_RAPIDAPI_KEY is set). Files come from the
// provider's CDN (download_url), so only the small JSON replies pass through RapidAPI.
const RAPID_KEY = process.env.YT_RAPIDAPI_KEY || '';
const RAPID_HOST = process.env.YT_RAPIDAPI_HOST || 'youtube-info-download-api.p.rapidapi.com';
// Low resolution by default to keep transfer small; clips are cut to 720x1280 anyway.
const RAPID_FORMAT = process.env.YT_DOWNLOAD_FORMAT || '480';
export const rapidEnabled = !!RAPID_KEY;
const rapidHeaders = () => ({ 'X-RapidAPI-Key': RAPID_KEY, 'X-RapidAPI-Host': RAPID_HOST });

// Remember an account-level RapidAPI failure (403 not subscribed, 401, 429 quota, 5xx) for a
// while, in memory and in KV, so every run doesn't pay for a doomed request first.
const RAPID_DOWN_KEY = 'yt:rapid:down';
const RAPID_DOWN_SEC = 15 * 60;
let rapidDownUntil = 0;
export const rapidAccountError = (status) => status === 401 || status === 403 || status === 429 || status >= 500;
export async function rapidDown() {
  if (!RAPID_KEY) return true;
  if (Date.now() < rapidDownUntil) return true;
  const v = await kvGetJson(RAPID_DOWN_KEY);
  if (v?.until && v.until > Date.now()) { rapidDownUntil = v.until; return true; }
  return false;
}
export function markRapidDown(status, why = '') {
  if (Date.now() < rapidDownUntil) return;
  rapidDownUntil = Date.now() + RAPID_DOWN_SEC * 1000;
  console.warn('rapidapi unavailable; skipping it for 15 min', { status, why: String(why).slice(0, 120) });
  kvSetJson(RAPID_DOWN_KEY, { until: rapidDownUntil, status }, RAPID_DOWN_SEC).catch(() => {});
}

export async function downloadViaRapid(url, timeoutMs = 120000, opts = {}) {
  const q = new URLSearchParams({ format: opts.format || RAPID_FORMAT, url });
  const r = await fetch(`https://${RAPID_HOST}/ajax/download.php?${q}`, { headers: rapidHeaders(), cache: 'no-store' });
  const j = await r.json().catch(() => null);
  if (rapidAccountError(r.status)) markRapidDown(r.status, j?.message);
  if (!r.ok || !j?.success || !j.progress_url) throw new Error(j?.text || (j?.message && !/contact us/i.test(j.message) ? j.message : '') || `download api rejected (${r.status})`);
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await new Promise(res => setTimeout(res, 2000));
    const p = await fetch(j.progress_url, { cache: 'no-store' }).then(x => x.json()).catch(() => null);
    if (!p) continue;
    const ok = p.success === 1 || p.success === true || p.success === '1';
    if (ok && p.download_url) return p.download_url;
    if (Number(p.progress) >= 1000 && !ok) throw new Error(p.text || 'download api failed');
  }
  throw new Error('download api timeout');
}

// Video length in seconds from the provider's info endpoint (works where YouTube blocks us); null if unknown.
export async function youtubeInfoDuration(url, timeoutMs = 8000) {
  if (!RAPID_KEY || (await rapidDown())) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(`https://${RAPID_HOST}/ajax/api.php?${new URLSearchParams({ function: 'i', u: url })}`, { headers: rapidHeaders(), signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (rapidAccountError(r.status)) { markRapidDown(r.status, 'info'); return null; }
    const j = await r.json().catch(() => null);
    const toSec = (v) => {
      if (typeof v === 'number') return v;
      const str = String(v ?? '').trim();
      if (/^\d+(\.\d+)?$/.test(str)) return Number(str);
      if (/^\d+(:\d{1,2}){1,2}$/.test(str)) return str.split(':').reduce((a, x) => a * 60 + Number(x), 0);
      return NaN;
    };
    if (!(toSec(j?.duration) > 0)) { const js = JSON.stringify(j || {}); console.log('yt info no duration', r.status, Object.keys(j || {}).join(','), (js.match(/.{0,80}(length|duration|Seconds).{0,80}/gi) || []).slice(0, 6).join(' | ')); }
    let d = toSec(j?.duration);
    if (!(d > 0)) d = toSec(j?.durationString);
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch { return null; }
}

// Facebook share links (/share/r/..., /share/v/..., fb.watch) redirect to the canonical
// /reel/<id> or /watch?v=<id> URL; downloaders handle the canonical form far more reliably.
export function isFacebookUrl(u) { try { return /(^|\.)(facebook\.com|fb\.watch)$/i.test(new URL(u).hostname); } catch { return false; } }
export async function resolveFacebookUrl(u) {
  try {
    const x = new URL(u);
    if (!/^\/share\//.test(x.pathname) && !/fb\.watch$/i.test(x.hostname)) return u;
    for (const ua of ['facebookexternalhit/1.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36']) {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': ua }, signal: ctrl.signal, cache: 'no-store' }).catch(() => null);
      clearTimeout(t);
      const loc = r?.headers?.get('location');
      if (loc) {
        const c = new URL(loc, u);
        const m = c.pathname.match(/^\/(reel|videos?)\/(\d+)/) || c.pathname.match(/^\/[^/]+\/videos\/(\d+)/);
        if (m) return m[2] ? `https://www.facebook.com/reel/${m[2]}/` : `https://www.facebook.com/watch/?v=${m[1]}`;
        if (c.pathname === '/watch/' || c.pathname === '/watch') { const v = c.searchParams.get('v'); if (v) return `https://www.facebook.com/watch/?v=${v}`; }
        if (!/login/.test(c.pathname)) { c.search = ''; return c.toString(); }
      }
    }
  } catch {}
  return u;
}
// Facebook via the hosted download API; returns a fetchable mp4 URL (verified) or throws.
export async function downloadFacebookViaApi(url, timeoutMs = 90000) {
  if (!downloadApiEnabled) throw new Error('download api not configured');
  const u = await downloadViaApi(url, timeoutMs, { format: '720' });
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
  const r = await fetch(u, { headers: { Range: 'bytes=0-1023' }, signal: ctrl.signal, cache: 'no-store' }).catch(() => null);
  clearTimeout(t);
  const ct = r?.headers?.get('content-type') || '';
  try { await r?.body?.cancel(); } catch {}
  if (!r || !(r.ok || r.status === 206) || /html|json|text/i.test(ct)) throw new Error('download api returned no video (' + (r?.status || 'no response') + ' ' + ct + ')');
  return u;
}

// Size of a remote file in bytes (HEAD, then a 1-byte range as fallback), or 0 if unknown.
export async function remoteSize(u) {
  for (const init of [{ method: 'HEAD' }, { headers: { Range: 'bytes=0-0' } }]) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(u, { ...init, signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      const cr = r.headers.get('content-range'); const cl = r.headers.get('content-length');
      try { await r.body?.cancel(); } catch {}
      const n = cr ? Number(cr.split('/')[1]) : (init.method === 'HEAD' ? Number(cl) : 0);
      if (n > 0) return n;
    } catch {}
  }
  return 0;
}
