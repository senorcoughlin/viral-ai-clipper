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
