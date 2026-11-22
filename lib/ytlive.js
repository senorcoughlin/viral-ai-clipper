// YouTube live: resolve a public HLS manifest and clip a rolling window.
// Datacenter IPs often get no HLS; we retry the lookup (and later the
// segment fetch) through a sticky residential proxy so googlevideo URLs stay
// bound to the same exit IP. When the proxy budget is exhausted we fail
// clearly so the user can upload a recording instead of burning a generation.
import { StreamError, parseMaster, pickVariants, parseMediaPlaylist, STREAM_UA } from './stream';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { put } from '@vercel/blob';
import { ffmpegPath } from './ffmpegbin';
import { proxyAllowed, proxyConfigured, stickyProxyUrl, proxyFetch, recordProxyAttempt, recordProxySuccess, recordProxyBytes, pickLiveVariants, redactProxy, ytDlpJson, pickLiveFormatsFromYtDlp } from './ytproxy';

const exec = promisify(execFile);

const CLIENTS = [
  { clientName: 'ANDROID', clientVersion: '19.28.35', androidSdkVersion: 34, ua: 'com.google.android.youtube/19.28.35 (Linux; U; Android 14; en_US) gzip' },
  { clientName: 'IOS', clientVersion: '19.45.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iOS', osVersion: '17.7.0.21H16', ua: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 17_7 like Mac OS X;)' },
  { clientName: 'TVHTML5', clientVersion: '7.20241201.18.00' },
  { clientName: 'MWEB', clientVersion: '2.20241201.01.00' },
  { clientName: 'WEB', clientVersion: '2.20241201.01.00' },
];

async function fetchJson(url, opts, ms = 10000, fetchFn = fetch) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetchFn(url, { ...opts, signal: ctrl.signal, cache: 'no-store' });
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

async function fetchPlayer(videoId, client, visitor, fetchFn) {
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
  }, 10000, fetchFn);
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

async function fetchWatch(videoId, fetchFn) {
  const { ok, text } = await fetchJson(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`, {
    method: 'GET',
    headers: { 'User-Agent': STREAM_UA, 'Accept-Language': 'en', 'Accept': 'text/html' },
  }, 12000, fetchFn);
  if (!ok || !text) return {};
  const player = extractJson(text, 'ytInitialPlayerResponse') || extractJson(text, 'var ytInitialPlayerResponse');
  const visitor = (text.match(/"VISITOR_DATA":"([^"]+)"/) || text.match(/"visitorData":"([^"]+)"/) || [])[1] || '';
  const hls = playerHls(player) || (text.match(/"hlsManifestUrl":"(https:[^"]+)"/) || [])[1]?.replace(/\\u0026/g, '&').replace(/\\+/g, '') || '';
  return { player, visitor, hls };
}

async function masterVariants(hlsUrl, fetchFn) {
  const { ok, text } = await fetchJson(hlsUrl, { method: 'GET', headers: { 'User-Agent': STREAM_UA } }, 10000, fetchFn);
  if (!ok || !text) return [];
  return parseMaster(text, hlsUrl);
}

async function playlistSecondsVia(url, fetchFn) {
  const { ok, text } = await fetchJson(url, { method: 'GET', headers: { 'User-Agent': STREAM_UA } }, 10000, fetchFn);
  if (!ok || !text) return 0;
  let sum = 0;
  for (const m of text.matchAll(/#EXTINF:([\d.]+)/g)) sum += Number(m[1]) || 0;
  return sum > 0 ? sum : 0;
}

function makeProxyFetch(proxyUrl) {
  return (url, opts) => proxyFetch(url, opts, { proxyUrl, timeoutMs: opts?.timeoutMs || 20000 });
}

async function resolveWith(videoId, fetchFn, viaProxy, proxySalt) {
  const watch = await fetchWatch(videoId, fetchFn).catch(() => ({}));
  let hls = watch.hls || '';
  let player = watch.player || null;
  if (!hls) {
    for (const client of CLIENTS) {
      const j = await fetchPlayer(videoId, client, watch.visitor, fetchFn);
      if (!j) continue;
      player = j;
      hls = playerHls(j);
      if (hls) break;
    }
  }
  const details = player?.videoDetails || {};
  const status = player?.playabilityStatus || {};
  if (hls) {
    const variants = await masterVariants(hls, fetchFn);
    const picked = viaProxy ? pickLiveVariants(variants) : pickVariants(variants);
    if (!picked.videoUrl) return { error: 'no_rendition', status, details };
    const duration = (await playlistSecondsVia(picked.videoUrl, fetchFn)) || 0;
    return {
      media: {
        videoUrl: picked.videoUrl,
        audioUrl: picked.audioUrl || picked.videoUrl,
        duration,
        live: true,
        youtube: true,
        viaProxy: !!viaProxy,
        proxySalt: viaProxy ? proxySalt : undefined,
        height: picked.height || null,
        title: details.title || '',
        channel: details.author || '',
      },
    };
  }
  return { error: 'no_hls', status, details };
}


async function resolveViaYtDlp(videoId, salt, proxyUrl, probeJson) {
  const j = probeJson
    ? await probeJson(videoId)
    : await ytDlpJson(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, { jobId: salt, timeoutMs: 60000 });
  if (!j) return null;
  const picked = pickLiveFormatsFromYtDlp(j);
  if (!picked.videoUrl) return null;
  const fetchFn = makeProxyFetch(proxyUrl || stickyProxyUrl(salt));
  const duration = (await playlistSecondsVia(picked.videoUrl, fetchFn)) || Number(j.duration) || 0;
  console.log('yt live via yt-dlp proxy', { height: picked.height, dur: duration, live: j.is_live || j.live_status === 'is_live' });
  return {
    videoUrl: picked.videoUrl,
    audioUrl: picked.audioUrl || picked.videoUrl,
    duration,
    live: true,
    youtube: true,
    viaProxy: true,
    proxySalt: salt,
    height: picked.height || null,
    title: j.title || '',
    channel: j.uploader || j.channel || '',
  };
}

function noHlsError(status) {
  const reason = String(status?.reason || status?.status || '');
  if (status?.status && status.status !== 'OK' && /private|unavailable|removed|copyright/i.test(reason)) {
    return new StreamError(`YouTube would not open this live stream (${reason}). Wait until it ends and paste the replay, or upload a recording.`, 'restricted');
  }
  return new StreamError('We could not attach to this live YouTube stream from our servers (YouTube did not give us a public video stream). Wait until it ends and paste the replay, or upload a recording of the part you want to clip.', 'no_hls');
}

// Resolve a live (or 24/7) YouTube video to { videoUrl, audioUrl, duration, live, title, channel }.
// When the direct lookup gets no HLS and a proxy is configured (and under budget), retries
// every request through one sticky port identified by proxySalt.
export async function resolveYoutubeLive(videoId, { proxySalt, fetchDirect = fetch, fetchProxy, probeJson } = {}) {
  if (!videoId) throw new StreamError('That YouTube link is missing a video id.', 'invalid');
  const direct = await resolveWith(videoId, fetchDirect, false, proxySalt);
  if (direct.media) return direct.media;

  const salt = proxySalt || `live:${videoId}`;
  if (proxyConfigured() && await proxyAllowed()) {
    const proxyUrl = stickyProxyUrl(salt);
    await recordProxyAttempt();
    try {
      const proxied = await resolveWith(videoId, fetchProxy || makeProxyFetch(proxyUrl), true, salt);
      if (proxied.media) {
        console.log('yt live via proxy', { height: proxied.media.height, dur: proxied.media.duration });
        return proxied.media;
      }
      const fromDl = await resolveViaYtDlp(videoId, salt, proxyUrl, probeJson);
      if (fromDl) return fromDl;
      if (proxied.error === 'no_rendition') {
        throw new StreamError('This live stream has no playable video rendition right now. Try again in a minute, or upload a recording.', 'no_hls');
      }
      throw noHlsError(proxied.status);
    } catch (e) {
      if (e?.userFacing) throw e;
      console.warn('yt live proxy lookup failed', redactProxy(e?.message));
      try {
        const fromDl = await resolveViaYtDlp(videoId, salt, proxyUrl, probeJson);
        if (fromDl) return fromDl;
      } catch (e2) { console.warn('yt live yt-dlp lookup failed', redactProxy(e2?.message)); }
      throw noHlsError(direct.status);
    }
  }

  if (direct.error === 'no_rendition') {
    throw new StreamError('This live stream has no playable video rendition right now. Try again in a minute, or upload a recording.', 'no_hls');
  }
  throw noHlsError(direct.status);
}

async function downloadUrl(url, file, fetchFn) {
  const r = await fetchFn(url, { method: 'GET', headers: { 'User-Agent': STREAM_UA } });
  if (!r.ok) throw new Error('segment ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(file, buf);
  return buf.length;
}

async function capturePlaylist(mediaUrl, start, len, dir, tag, fetchFn) {
  const r = await fetchFn(mediaUrl, { method: 'GET', headers: { 'User-Agent': STREAM_UA } });
  if (!r.ok) throw new Error('playlist ' + r.status);
  const text = await r.text();
  await recordProxyBytes(Buffer.byteLength(text));
  const segs = parseMediaPlaylist(text, mediaUrl);
  const end = start + len;
  const pick = segs.filter(s => s.start + s.dur > start && s.start < end);
  if (!pick.length) throw new StreamError('That part of the stream is not available yet.', 'unavailable');
  const work = path.join(dir, tag);
  await fs.mkdir(work, { recursive: true });
  let bytes = 0;
  const header = [];
  for (let i = 0; i < (segs.header || []).length; i++) {
    const line = segs.header[i];
    const uri = (line.match(/URI="([^"]+)"/) || [])[1];
    if (!uri) { header.push(line); continue; }
    const f = `init-${i}.mp4`;
    bytes += await downloadUrl(uri, path.join(work, f), fetchFn);
    header.push(line.replace(/URI="([^"]+)"/, `URI="${f}"`));
  }
  // Small concurrency, same sticky session.
  // fMP4 (EXT-X-MAP) uses .m4s; MPEG-TS playlists use .ts. ffmpeg's HLS demuxer
  // rejects unknown extensions such as .bin even with -allowed_extensions ALL.
  const ext = (segs.header || []).some(l => l.startsWith('#EXT-X-MAP')) ? 'm4s' : 'ts';
  const files = new Array(pick.length);
  const segBytes = new Array(pick.length).fill(0);
  let i = 0;
  async function worker() {
    while (i < pick.length) {
      const idx = i++;
      const f = `seg-${idx}.${ext}`;
      files[idx] = f;
      segBytes[idx] = await downloadUrl(pick[idx].url, path.join(work, f), fetchFn);
    }
  }
  await Promise.all([0, 1, 2].map(() => worker()));
  bytes += segBytes.reduce((a, b) => a + b, 0);
  const target = Math.max(1, Math.ceil(Math.max(...pick.map(s => s.dur))));
  const playlist = ['#EXTM3U', '#EXT-X-VERSION:3', `#EXT-X-TARGETDURATION:${target}`, '#EXT-X-MEDIA-SEQUENCE:0', '#EXT-X-PLAYLIST-TYPE:VOD', ...header,
    ...pick.flatMap((s, idx) => [`#EXTINF:${s.dur.toFixed(3)},`, files[idx]]), '#EXT-X-ENDLIST', ''].join('\n');
  const listFile = path.join(work, 'window.m3u8');
  await fs.writeFile(listFile, playlist);
  const out = path.join(work, 'window.mp4');
  const bin = ffmpegPath();
  if (!bin) throw new Error('ffmpeg missing');
  await exec(bin, ['-y', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file,crypto,data', '-allowed_extensions', 'ALL', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', out], { cwd: work });
  const st = await fs.stat(out);
  if (!st.size) throw new Error('empty live capture');
  const duration = pick.reduce((s, x) => s + x.dur, 0);
  const offset = Math.max(0, start - pick[0].start);
  return { file: out, bytes, duration, offset };
}

// Pull [start, start+len] of a proxied YouTube live HLS through the same sticky
// port used for the lookup, mux a local mp4, upload it to Blob, and count the
// bytes against the monthly proxy budget.
export async function captureLiveWindow({ videoUrl, audioUrl, start, len, dir, proxySalt, timeoutMs = 180000, upload = true } = {}) {
  if (!(await proxyAllowed())) {
    const e = new Error('proxy monthly budget reached');
    e.code = 'proxy_budget';
    e.proxyBudget = true;
    throw e;
  }
  const proxyUrl = stickyProxyUrl(proxySalt || 'live');
  const fetchFn = makeProxyFetch(proxyUrl);
  const t0 = Date.now();
  const budget = Math.max(20000, timeoutMs);
  let video, audio;
  try {
    video = await capturePlaylist(videoUrl, start, len, dir, 'live-v', fetchFn);
    if (audioUrl && audioUrl !== videoUrl) {
      try { audio = await capturePlaylist(audioUrl, start, len, dir, 'live-a', fetchFn); }
      catch (e) { console.warn('live audio capture failed', redactProxy(e?.message)); }
    }
  } catch (e) {
    if (e?.userFacing || e?.proxyBudget) throw e;
    throw new Error(redactProxy(e?.message || e, proxyUrl));
  }
  if (Date.now() - t0 > budget) console.warn('live capture slow', { ms: Date.now() - t0 });
  let file = video.file;
  let duration = video.duration;
  const offset = video.offset;
  if (audio?.file) {
    const muxed = path.join(dir, 'live-window.mp4');
    const bin = ffmpegPath();
    try {
      await exec(bin, ['-y', '-hide_banner', '-loglevel', 'error', '-i', video.file, '-i', audio.file, '-c', 'copy', '-shortest', '-movflags', '+faststart', muxed]);
      file = muxed;
      duration = Math.min(video.duration, audio.duration);
    } catch (e) {
      console.warn('live mux failed; using video only', redactProxy(e?.message));
    }
  }
  const bytes = (video.bytes || 0) + (audio?.bytes || 0);
  await recordProxySuccess(bytes);
  let url = '';
  if (upload && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await put(`sources/live_${Date.now()}.mp4`, (await fs.readFile(file)), { access: 'private', contentType: 'video/mp4', addRandomSuffix: true });
      url = blob.url;
    } catch (e) { console.warn('live blob upload failed', e?.message); }
  }
  console.log('yt live captured', { mb: +(bytes / 1e6).toFixed(2), sec: Math.round(duration), ms: Date.now() - t0 });
  return { file, url, bytes, duration, offset };
}

// Finished 24/7 restreams and some live pages report a multi-day duration instead of "live".
export const YT_LIVE_LOOKALIKE_SEC = 12 * 3600;
export function looksLikeYoutubeLive(secs, flags = {}) {
  if (flags.live || secs === -1) return true;
  return Number(secs) > YT_LIVE_LOOKALIKE_SEC;
}
