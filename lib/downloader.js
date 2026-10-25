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

export async function downloadViaApi(url, timeoutMs = 120000) {
  const q = new URLSearchParams({ url, format: '720', apikey: API_KEY });
  const r = await fetch(`${API_HOST}/ajax/download.php?${q}`, { cache: 'no-store' });
  const j = await r.json().catch(() => null);
  if (!j?.success || !j.id) throw new Error(j?.text || 'download api rejected');
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
export function youtubeDownloader() {
  if (downloaderEnabled) return downloadViaService;
  if (rapidEnabled) return downloadViaRapid;
  if (downloadApiEnabled) return downloadViaApi;
  return null;
}

// Same provider via RapidAPI (preferred when YT_RAPIDAPI_KEY is set). Files come from the
// provider's CDN (download_url), so only the small JSON replies pass through RapidAPI.
const RAPID_KEY = process.env.YT_RAPIDAPI_KEY || '';
const RAPID_HOST = process.env.YT_RAPIDAPI_HOST || 'youtube-info-download-api.p.rapidapi.com';
// Low resolution by default to keep transfer small; clips are cut to 720x1280 anyway.
const RAPID_FORMAT = process.env.YT_DOWNLOAD_FORMAT || '480';
export const rapidEnabled = !!RAPID_KEY;
const rapidHeaders = () => ({ 'X-RapidAPI-Key': RAPID_KEY, 'X-RapidAPI-Host': RAPID_HOST });

export async function downloadViaRapid(url, timeoutMs = 120000) {
  const q = new URLSearchParams({ format: RAPID_FORMAT, url });
  const r = await fetch(`https://${RAPID_HOST}/ajax/download.php?${q}`, { headers: rapidHeaders(), cache: 'no-store' });
  const j = await r.json().catch(() => null);
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
  if (!RAPID_KEY) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(`https://${RAPID_HOST}/ajax/api.php?${new URLSearchParams({ function: 'i', u: url })}`, { headers: rapidHeaders(), signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    const j = await r.json().catch(() => null);
    const toSec = (v) => {
      if (typeof v === 'number') return v;
      const str = String(v ?? '').trim();
      if (/^\d+(\.\d+)?$/.test(str)) return Number(str);
      if (/^\d+(:\d{1,2}){1,2}$/.test(str)) return str.split(':').reduce((a, x) => a * 60 + Number(x), 0);
      return NaN;
    };
    let d = toSec(j?.duration);
    if (!(d > 0)) d = toSec(j?.durationString);
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch { return null; }
}
