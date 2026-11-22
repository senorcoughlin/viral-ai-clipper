// YouTube live: resolve a public HLS manifest (no RenderIO / yt-dlp) and clip a rolling window.
// Datacenter IPs often get no HLS; we try several clients and the watch page, then fail clearly
// so the user can upload a recording instead of burning a generation.
import { StreamError, parseMaster, pickVariants, playlistSeconds, STREAM_UA } from './stream';

const CLIENTS = [
  { clientName: 'ANDROID', clientVersion: '19.28.35', androidSdkVersion: 34, ua: 'com.google.android.youtube/19.28.35 (Linux; U; Android 14; en_US) gzip' },
  { clientName: 'IOS', clientVersion: '19.45.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iOS', osVersion: '17.7.0.21H16', ua: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 17_7 like Mac OS X;)' },
  { clientName: 'TVHTML5', clientVersion: '7.20241201.18.00' },
  { clientName: 'MWEB', clientVersion: '2.20241201.01.00' },
  { clientName: 'WEB', clientVersion: '2.20241201.01.00' },
];

async function fetchJson(url, opts, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, cache: 'no-store' });
    const text = await r.text().catch(() => '');
    let j = null; try { j = JSON.parse(text); } catch {}
    return { ok: r.ok, status: r.status, j, text };
  } catch {
    return { ok: false, status: 0, j: null, text: '' };
  } finally {
    clearTimeout(t);
  }
}

function playerHls(player) {
  return player?.streamingData?.hlsManifestUrl || '';
}

async function fetchPlayer(videoId, client, visitor) {
  const { ua, ...ctxClient } = client;
  const headers = { 'Content-Type': 'application/json', 'User-Agent': ua || STREAM_UA };
  if (visitor) headers['X-Goog-Visitor-Id'] = visitor;
  const { j } = await fetchJson('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      context: { client: { hl: 'en', gl: 'US', ...(visitor ? { visitorData: visitor } : {}), ...ctxClient } },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });
  return j;
}

function extractJson(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = html.indexOf('{', i);
  if (start < 0) return null;
  let depth = 0;
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(html.slice(start, j + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

async function fetchWatch(videoId) {
  const { ok, text } = await fetchJson(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`, {
    method: 'GET',
    headers: { 'User-Agent': STREAM_UA, 'Accept-Language': 'en', 'Accept': 'text/html' },
  }, 12000);
  if (!ok || !text) return {};
  const player = extractJson(text, 'ytInitialPlayerResponse') || extractJson(text, 'var ytInitialPlayerResponse');
  const visitor = (text.match(/"VISITOR_DATA":"([^"]+)"/) || text.match(/"visitorData":"([^"]+)"/) || [])[1] || '';
  const hls = playerHls(player) || (text.match(/"hlsManifestUrl":"(https:[^"]+)"/) || [])[1]?.replace(/\\u0026/g, '&').replace(/\\+/g, '') || '';
  return { player, visitor, hls };
}

async function masterVariants(hlsUrl) {
  const { ok, text } = await fetchJson(hlsUrl, { method: 'GET', headers: { 'User-Agent': STREAM_UA } });
  if (!ok || !text) return [];
  return parseMaster(text, hlsUrl);
}

// Resolve a live (or 24/7) YouTube video to { videoUrl, audioUrl, duration, live, title, channel }.
export async function resolveYoutubeLive(videoId) {
  if (!videoId) throw new StreamError('That YouTube link is missing a video id.', 'invalid');
  const watch = await fetchWatch(videoId).catch(() => ({}));
  let hls = watch.hls || '';
  let player = watch.player || null;
  if (!hls) {
    for (const client of CLIENTS) {
      const j = await fetchPlayer(videoId, client, watch.visitor);
      if (!j) continue;
      player = j;
      hls = playerHls(j);
      if (hls) break;
    }
  }
  const details = player?.videoDetails || {};
  const status = player?.playabilityStatus || {};
  if (hls) {
    const variants = await masterVariants(hls);
    const { videoUrl, audioUrl } = pickVariants(variants);
    if (!videoUrl) throw new StreamError('This live stream has no playable video rendition right now. Try again in a minute, or upload a recording.', 'no_hls');
    const duration = (await playlistSeconds(videoUrl)) || 0;
    return {
      videoUrl,
      audioUrl: audioUrl || videoUrl,
      duration,
      live: true,
      youtube: true,
      title: details.title || '',
      channel: details.author || '',
    };
  }
  const reason = String(status.reason || status.status || '');
  if (status.status && status.status !== 'OK' && /private|unavailable|removed|copyright/i.test(reason)) {
    throw new StreamError(`YouTube would not open this live stream (${reason}). Wait until it ends and paste the replay, or upload a recording.`, 'restricted');
  }
  throw new StreamError('We could not attach to this live YouTube stream from our servers (YouTube did not give us a public video stream). Wait until it ends and paste the replay, or upload a recording of the part you want to clip.', 'no_hls');
}

// Finished 24/7 restreams and some live pages report a multi-day duration instead of "live".
export const YT_LIVE_LOOKALIKE_SEC = 12 * 3600;
export function looksLikeYoutubeLive(secs, flags = {}) {
  if (flags.live || secs === -1) return true;
  return Number(secs) > YT_LIVE_LOOKALIKE_SEC;
}
