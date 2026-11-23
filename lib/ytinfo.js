// Robust YouTube length lookup (seconds), used before a run is charged.
// YouTube often hides the length from datacenter IPs (watch page has no lengthSeconds,
// the download provider's info call returns no duration). Without the length, long
// stream VODs were sent down the single-file path, the provider refused them for length,
// and users saw "YouTube downloads are temporarily down". Try, in order:
//   1. KV cache (7 days)
//   2. watch page + InnerTube player (WEB, MWEB) directly — same contract as ytduration.js
//   3. the download provider's info call
//   4. InnerTube player through the residential proxy (~10 KB, counted in the proxy budget)
// Returns seconds (> 0), -1 live now, -2 upcoming, 0 unavailable, or null when unknown.
import { youtubeDuration } from './ytduration';
import { youtubeInfoDuration } from './downloader';
import { kvGetJson, kvSetJson } from './kv';
import { proxyConfigured, proxyAllowed, stickyProxyUrl, proxyFetch, recordProxyBytes } from './ytproxy';

const CACHE_KEY = (id) => `ytlen1:${id}`;
const CACHE_TTL = 7 * 24 * 3600;
const PLAYER_CLIENTS = [
  { clientName: 'WEB', clientVersion: '2.20241201.01.00' },
  { clientName: 'MWEB', clientVersion: '2.20241201.01.00' },
];

// { secs, live, upcoming } from an InnerTube /player reply; null when it has no details.
export function lengthFromPlayer(j) {
  const d = j?.videoDetails;
  if (!d) return null;
  if (d.isLive === true) return { secs: -1 };
  if (d.isUpcoming === true) return { secs: -2 };
  const s = Number(d.lengthSeconds);
  return s > 0 ? { secs: s } : null;
}

async function playerLength(videoId, fetchFn, timeoutMs = 7000) {
  for (const client of PLAYER_CLIENTS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetchFn('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
        body: JSON.stringify({ context: { client: { hl: 'en', gl: 'US', ...client } }, videoId, contentCheckOk: true, racyCheckOk: true }),
        signal: ctrl.signal,
        cache: 'no-store',
      });
      const text = await r.text().catch(() => '');
      if (fetchFn !== fetch) await recordProxyBytes(Buffer.byteLength(text)).catch(() => {});
      let j = null; try { j = JSON.parse(text); } catch {}
      const got = lengthFromPlayer(j);
      if (got) return got.secs;
    } catch {} finally { clearTimeout(t); }
  }
  return null;
}

export async function resolveYoutubeSecs(ytId, videoUrl, { proxy = true, cache = true, deps = {} } = {}) {
  if (!ytId) return null;
  const page = deps.page || youtubeDuration;
  const info = deps.info || youtubeInfoDuration;
  const player = deps.player || playerLength;
  const kvGet = deps.kvGet || kvGetJson;
  const kvSet = deps.kvSet || kvSetJson;
  if (cache) {
    const c = await kvGet(CACHE_KEY(ytId)).catch(() => null);
    if (c?.secs > 0) return c.secs;
  }
  const save = (secs, via) => {
    if (secs > 0) {
      console.log('yt length', { ytId, secs, via });
      if (cache) kvSet(CACHE_KEY(ytId), { secs, via }, CACHE_TTL).catch(() => {});
    }
    return secs;
  };
  // Watch page and direct InnerTube together (each ~1s); the page knows live/upcoming/removed.
  const [p, d] = await Promise.all([
    Promise.resolve(page(ytId)).catch(() => null),
    Promise.resolve(player(ytId, fetch)).catch(() => null),
  ]);
  if (p === -1 || p === -2) return p;
  if (p > 0) return save(p, 'page');
  if (d === -1 || d === -2) return d;
  if (d > 0) return save(d, 'player');
  const fromInfo = await Promise.resolve(info(videoUrl || `https://www.youtube.com/watch?v=${ytId}`)).catch(() => null);
  if (fromInfo > 0) return save(fromInfo, 'info');
  if (proxy && (deps.proxyFetchFn || (proxyConfigured() && await proxyAllowed().catch(() => false)))) {
    const purl = deps.proxyFetchFn ? null : stickyProxyUrl('len:' + ytId);
    const pf = deps.proxyFetchFn || ((u, init) => proxyFetch(u, init, { proxyUrl: purl, timeoutMs: 10000 }));
    const viaProxy = await Promise.resolve(player(ytId, pf, 10000)).catch(() => null);
    if (viaProxy === -1 || viaProxy === -2) return viaProxy;
    if (viaProxy > 0) return save(viaProxy, 'proxy');
  }
  if (p === 0) return 0; // watch page said the video is gone and nothing else found it
  console.warn('yt length unknown', { ytId });
  return null;
}
