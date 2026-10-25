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
  if (!j?.success || !j.id) throw new Error(j?.message || 'download api rejected');
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await new Promise(res => setTimeout(res, 2500));
    const p = await fetch(`${API_HOST}/ajax/progress.php?id=${encodeURIComponent(j.id)}`, { cache: 'no-store' }).then(x => x.json()).catch(() => null);
    if (p && Number(p.progress) >= 1000) {
      if ((p.success === 1 || p.success === true || p.success === '1') && p.download_url) return p.download_url;
      throw new Error(p.text || p.message || 'download api failed');
    }
  }
  throw new Error('download api timeout');
}

// Pick the best configured YouTube downloader, or null to use RenderIO.
export function youtubeDownloader() {
  if (downloaderEnabled) return downloadViaService;
  if (downloadApiEnabled) return downloadViaApi;
  return null;
}
