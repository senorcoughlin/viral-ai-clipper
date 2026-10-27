// YouTube captions via the RapidAPI YouTube Info & Download API (subtitles job -> .vtt).
// Auto-generated captions carry per-word timings (<00:00:01.057><c>word</c>), which we keep;
// manual captions come back as phrase segments.
import { rapidDown, markRapidDown, rapidAccountError } from './downloader';

const RAPID_KEY = process.env.YT_RAPIDAPI_KEY || '';
const RAPID_HOST = process.env.YT_RAPIDAPI_HOST || 'youtube-info-download-api.p.rapidapi.com';
export const subtitlesEnabled = !!RAPID_KEY;

const ts = (s) => { const p = s.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
const clean = (t) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

export function parseVtt(vtt) {
  const cues = [];
  for (const block of String(vtt).replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n');
    const i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) continue;
    const m = lines[i].match(/([\d:.]+)\s*-->\s*([\d:.]+)/);
    if (!m) continue;
    cues.push({ start: ts(m[1]), end: ts(m[2]), lines: lines.slice(i + 1) });
  }
  const auto = cues.some(c => c.lines.some(l => /<c>/.test(l)));
  const segments = [];
  if (auto) {
    for (const c of cues) {
      const line = c.lines.find(l => /<c>/.test(l));
      if (!line) continue;
      const first = clean(line.split('<')[0]);
      if (first) first.split(' ').forEach(w => segments.push({ start: c.start, end: c.start, text: w }));
      for (const mm of line.matchAll(/<(\d[\d:.]+)><c>([^<]*)<\/c>/g)) {
        const w = clean(mm[2]);
        if (w) w.split(' ').forEach(x => segments.push({ start: ts(mm[1]), end: ts(mm[1]), text: x }));
      }
    }
    for (let k = 0; k < segments.length; k++) {
      const nx = segments[k + 1];
      segments[k].end = nx ? Math.max(segments[k].start + 0.05, Math.min(nx.start, segments[k].start + 1.5)) : segments[k].start + 0.5;
    }
  } else {
    let last = '';
    for (const c of cues) {
      const text = clean(c.lines.join(' '));
      if (!text || text === last) continue;
      last = text;
      segments.push({ start: c.start, end: c.end, text });
    }
  }
  return { text: segments.map(s => s.text).join(' '), segments };
}

export async function fetchYoutubeSubtitles(url, timeoutMs = 60000) {
  if (!RAPID_KEY || (await rapidDown())) return { text: '', segments: [] };
  const end = Date.now() + timeoutMs;
  const tryLang = async (lang) => {
    const q = new URLSearchParams({ url, format: 'vtt', ...(lang ? { lang } : {}) });
    const r = await fetch(`https://${RAPID_HOST}/ajax/subtitles.php?${q}`, { headers: { 'X-RapidAPI-Key': RAPID_KEY, 'X-RapidAPI-Host': RAPID_HOST }, cache: 'no-store' });
    if (rapidAccountError(r.status)) { markRapidDown(r.status, 'subtitles'); throw new Error('rapidapi ' + r.status); }
    const j = await r.json().catch(() => null);
    if (!j?.progress_url) return null;
    while (Date.now() < end) {
      await new Promise(res => setTimeout(res, 2000));
      const p = await fetch(j.progress_url, { cache: 'no-store' }).then(x => x.json()).catch(() => null);
      if (!p || Number(p.progress) < 1000) continue;
      if (!(p.success === 1 || p.success === true) || !p.download_url) return null;
      const v = await fetch(p.download_url, { cache: 'no-store' }).then(x => x.ok ? x.text() : '').catch(() => '');
      return v ? parseVtt(v) : null;
    }
    return null;
  };
  try {
    const t0 = Date.now();
    let tr = await tryLang('en');
    if (!tr?.segments?.length && Date.now() < end) tr = await tryLang('');
    console.log('youtube subtitles', { ms: Date.now() - t0, words: tr?.segments?.length || 0 });
    return tr?.segments?.length ? tr : { text: '', segments: [] };
  } catch (e) {
    console.warn('subtitles failed', e?.message);
    return { text: '', segments: [] };
  }
}
