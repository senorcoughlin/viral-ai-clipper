import { Transform } from 'stream';
// Local (in-function) prep for downloaded sources: the file is pulled once into /tmp,
// audio is extracted and transcribed in parallel chunks here, and each clip gets a small
// pre-trimmed segment in Blob so RenderIO only ever touches a few MB per job.
import fs from 'fs/promises';
import { createWriteStream, createReadStream } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { put } from '@vercel/blob';
import os from 'os';
import { toRenderUrl, isBlobUrl } from './media';

const exec = promisify(execFile);
import { ffmpegPath } from './ffmpegbin';
export const localFfmpegAvailable = () => !!ffmpegPath();
const ffmpegBin = () => { const p = ffmpegPath(); if (!p) throw new Error('ffmpeg missing'); return p; };

// What a too-small "video" actually was (an error page / JSON), for the logs.
async function tinyBody(file, r) {
  const txt = await fs.readFile(file, 'utf8').catch(() => '');
  return `${r.headers.get('content-type') || '?'} ${txt.replace(/\s+/g, ' ').slice(0, 200)}`;
}

// Counts bytes (starting from `have`, for Range resumes) and fails with err.tooBig once maxBytes is passed (protects the 512 MB /tmp).
function byteCap(maxBytes, have = 0) {
  let n = have;
  return new Transform({ transform(chunk, _e, cb) { n += chunk.length; if (maxBytes && n > maxBytes) { const e = new Error('source larger than ' + Math.round(maxBytes / 1e6) + ' MB'); e.tooBig = true; return cb(e); } cb(null, chunk); } });
}

// Abort a transfer only when no new bytes arrive for stallMs. A slow-but-progressing
// pull of a long video is allowed to run until the overall deadline.
export const SOURCE_STALL_MS = Number(process.env.SOURCE_STALL_MS || 20000);
export const SOURCE_RESUME_ATTEMPTS = Number(process.env.SOURCE_RESUME_ATTEMPTS || 5);
const HEADERS_MS = 30000;

function rangeStartOf(header) {
  const m = String(header || '').match(/bytes\s+(\d+)-/i);
  return m ? Number(m[1]) : 0;
}

function stallController(parent, stallMs) {
  const stall = new AbortController();
  let last = Date.now();
  const tick = () => { last = Date.now(); };
  const iv = setInterval(() => { if (Date.now() - last > stallMs) { const e = new Error('source download stalled'); e.stalled = true; stall.abort(e); } }, Math.min(1000, Math.max(250, stallMs / 4)));
  const onParent = () => stall.abort(parent.reason);
  parent.addEventListener?.('abort', onParent);
  const signal = (typeof AbortSignal !== 'undefined' && AbortSignal.any) ? AbortSignal.any([parent, stall.signal]) : stall.signal;
  return { signal, tick, stop() { clearInterval(iv); parent.removeEventListener?.('abort', onParent); } };
}

function classifyAbort(e, parent, stall) {
  if (e?.tooBig) return e;
  const reason = e?.cause || e?.reason || stall?.signal?.reason || parent?.reason || e;
  if (e?.stalled || reason?.stalled || stall?.signal?.aborted && !parent?.aborted) {
    const s = new Error('source download stalled');
    s.stalled = true;
    s.cause = e;
    return s;
  }
  if (e?.deadline || reason?.deadline || parent?.aborted) {
    const d = new Error('source fetch aborted');
    d.deadline = true;
    d.cause = e;
    return d;
  }
  return e;
}

async function uploadSourceBlob(blobPath, file, signal) {
  const blob = await put(blobPath, createReadStream(file), { access: 'private', contentType: 'video/mp4', addRandomSuffix: true, multipart: true, abortSignal: signal });
  return blob.url;
}

// One GET (optionally Range) into `file`. Throws .stalled, .tooBig, .deadline, or a fetch error.
async function pullAttempt(url, file, have, headers, maxBytes, signal, stallMs, teeBlobPath) {
  const h = { ...headers };
  if (have > 0) h.Range = `bytes=${have}-`;
  const headerCtrl = new AbortController();
  const headerTimer = setTimeout(() => {
    const s = new Error('source headers timeout');
    s.stalled = true;
    headerCtrl.abort(s);
  }, Math.min(HEADERS_MS, 30000));
  const headerSignal = (typeof AbortSignal !== 'undefined' && AbortSignal.any) ? AbortSignal.any([signal, headerCtrl.signal]) : headerCtrl.signal;
  let r;
  try {
    // Blob objects are immutable: let the Blob CDN cache serve repeat reads (`no-store` would
    // send Cache-Control: no-cache and force an origin read every time). Provider links stay uncached.
    r = await fetch(url, { signal: headerSignal, headers: h, ...(isBlobUrl(url) ? { next: { revalidate: 0 } } : { cache: 'no-store' }) });
  } catch (e) {
    clearTimeout(headerTimer);
    throw classifyAbort(e, signal, headerCtrl);
  }
  clearTimeout(headerTimer);

  if (have > 0 && r.status === 416) {
    try { await r.body?.cancel(); } catch {}
    const st = await fs.stat(file).catch(() => ({ size: have }));
    if (st.size >= 1000) return { size: st.size };
    throw new Error('source fetch 416');
  }
  if (have > 0 && r.status === 200) have = 0; // server ignored Range: start the file over
  if (!(r.ok || r.status === 206) || !r.body) {
    try { await r.body?.cancel(); } catch {}
    throw new Error('source fetch ' + r.status);
  }
  if (have > 0 && r.status === 206) {
    const start = rangeStartOf(r.headers.get('content-range'));
    if (start !== have) {
      if (start === 0) have = 0;
      else { try { await r.body?.cancel(); } catch {} throw new Error('source range mismatch ' + start + ' vs ' + have); }
    }
  }
  const flags = have > 0 ? 'a' : 'w';
  const cap = byteCap(maxBytes, have);
  const watch = stallController(signal, stallMs);
  watch.tick();
  const ticking = new Transform({ transform(chunk, _e, cb) { watch.tick(); cb(null, chunk); } });
  try {
    if (teeBlobPath && have === 0) {
      const [a, b] = r.body.tee();
      const up = put(teeBlobPath, Readable.fromWeb(b), { access: 'private', contentType: 'video/mp4', addRandomSuffix: true, multipart: true, abortSignal: watch.signal });
      up.catch(() => {}); // never leave the upload's rejection unhandled (an abort used to crash the process)
      try { await pipeline(Readable.fromWeb(a), ticking, cap, createWriteStream(file, { flags }), { signal: watch.signal }); }
      catch (e) { try { await r.body?.cancel(); } catch {} throw classifyAbort(e, signal, watch); }
      const blobUrl = (await up).url;
      const st = await fs.stat(file);
      if (st.size < 1000) throw new Error('source file empty: ' + await tinyBody(file, r));
      return { size: st.size, blobUrl };
    }
    await pipeline(Readable.fromWeb(r.body), ticking, cap, createWriteStream(file, { flags }), { signal: watch.signal });
    const st = await fs.stat(file);
    if (st.size < 1000) throw new Error('source file empty: ' + await tinyBody(file, r));
    return { size: st.size };
  } catch (e) {
    try { await r.body?.cancel(); } catch {}
    throw classifyAbort(e, signal, watch);
  } finally {
    watch.stop();
  }
}

export async function downloadToFile(url, file, timeoutMs = 120000, headers = {}, blobPath = null, maxBytes = 0, opts = {}) {
  const stallMs = opts.stallMs ?? SOURCE_STALL_MS;
  const maxAttempts = opts.maxAttempts ?? SOURCE_RESUME_ATTEMPTS;
  const deadline = Date.now() + timeoutMs;
  const t0 = Date.now();
  const region = process.env.VERCEL_REGION || 'local';
  console.log('source pull start', { region, timeoutSec: Math.round(timeoutMs / 1000) });
  let lastErr;
  let attempt = 0;
  await fs.rm(file, { force: true }).catch(() => {});
  while (attempt < maxAttempts) {
    attempt++;
    const left = deadline - Date.now();
    if (left < 1000) break;
    const have = await fs.stat(file).then(s => s.size).catch(() => 0);
    if (have > 0) console.log('source pull resume', { attempt, fromMb: Math.round(have / 1e6), leftSec: Math.round(left / 1000) });
    const ctrl = new AbortController();
    const t = setTimeout(() => { const d = new Error('source fetch aborted'); d.deadline = true; ctrl.abort(d); }, left);
    try {
      const res = await pullAttempt(url, file, have, headers, maxBytes, ctrl.signal, stallMs, (blobPath && have === 0) ? blobPath : null);
      clearTimeout(t);
      if (blobPath && !res.blobUrl) {
        const upLeft = deadline - Date.now();
        if (upLeft < 1000) { const d = new Error('source fetch aborted'); d.deadline = true; throw d; }
        const upCtrl = new AbortController();
        const ut = setTimeout(() => upCtrl.abort(), upLeft);
        try { res.blobUrl = await uploadSourceBlob(blobPath, file, upCtrl.signal); }
        finally { clearTimeout(ut); }
      }
      const ms = Date.now() - t0;
      console.log('source pull done', { region, mb: +(res.size / 1e6).toFixed(2), sec: +(ms / 1000).toFixed(1), MBps: res.size ? +(res.size / 1e6 / Math.max(0.001, ms / 1000)).toFixed(2) : 0 });
      return blobPath ? { size: res.size, blobUrl: res.blobUrl } : { size: res.size };
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      const n = await fs.stat(file).then(x => x.size).catch(() => 0);
      const ms = Date.now() - t0;
      console.warn('source pull aborted', { region, mb: Math.round(n / 1e6), sec: Math.round(ms / 1000), MBps: n ? +(n / 1e6 / Math.max(0.001, ms / 1000)).toFixed(2) : 0, attempt, resume: n > 0 && !e?.tooBig && !e?.deadline, stalled: !!e?.stalled, deadline: !!e?.deadline, err: String(e?.message || e).slice(0, 120) });
      if (isNoSpace(e)) {
        // /tmp is full: retrying only refills it. Free the partial file and fail like an oversize
        // source, so callers fall back to a lighter tier instead of crashing the job.
        await fs.rm(file, { force: true }).catch(() => {});
        const ns = new Error('not enough temporary disk space for this source'); ns.tooBig = true; ns.noSpace = true; ns.cause = e;
        throw ns;
      }
      if (e?.tooBig || e?.deadline) throw e;
      if (attempt >= maxAttempts || deadline - Date.now() < 1500) throw e;
      await new Promise(r => setTimeout(r, Math.min(1500, Math.max(0, deadline - Date.now() - 500))));
    }
  }
  throw lastErr || new Error('source fetch aborted');
}

export async function probeDuration(file) {
  const r = await exec(ffmpegBin(), ['-hide_banner', '-i', file]).catch(e => e);
  const m = String(r?.stderr || '').match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

// Live captures can come back video-only (the separate audio capture failed or timed out).
// ffmpeg -i lists every stream; cache per file so callers can ask cheaply.
const audioProbeCache = new Map();
export async function hasAudioStream(file) {
  if (audioProbeCache.has(file)) return audioProbeCache.get(file);
  const r = await exec(ffmpegBin(), ['-hide_banner', '-i', file]).catch(e => e);
  const err = String(r?.stderr || '');
  // If ffmpeg could not read the file at all, assume audio so the normal path reports the real error.
  const has = /Stream #\d+:\d+.*: Audio:/.test(err) || !/Stream #\d+:\d+/.test(err);
  if (audioProbeCache.size > 200) audioProbeCache.clear();
  audioProbeCache.set(file, has);
  return has;
}
export function noAudioError() {
  const e = new Error('source has no audio track');
  e.code = 'no_audio';
  return e;
}

// ID3 / MPEG frame / ftyp / RIFF WAVE — enough for Groq and Gemini to accept the file.
export function isValidAudioBuffer(buf) {
  if (!buf || buf.length < 256) return false;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return true;
  if (buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp') return true;
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return true;
  return false;
}

export function audioFormMeta(buf) {
  if (buf && buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp') return { type: 'audio/mp4', name: 'audio.m4a' };
  if (buf && buf.toString('ascii', 0, 4) === 'RIFF') return { type: 'audio/wav', name: 'audio.wav' };
  return { type: 'audio/mpeg', name: 'audio.mp3' };
}

export function isGroqQuotaError(result) {
  const status = Number(result?.status ?? result?.error);
  const detail = String(result?.detail || result?.message || result || '');
  return status === 429 || /seconds of audio per day|\baspd\b|rate limit reached/i.test(detail);
}

const AUDIO_IN = ['-fflags', '+genpts+discardcorrupt'];

// One well-formed mp3 (or m4a) of the whole soundtrack. The segment muxer used
// to write headerless/broken mp3 chunks that Groq rejected as invalid_media_file.
export async function extractWholeAudio(file, outBase, bitrate = '32k') {
  if (!(await hasAudioStream(file))) throw noAudioError();
  const mp3 = `${outBase}.mp3`;
  try {
    await exec(ffmpegBin(), ['-y', '-hide_banner', '-loglevel', 'error', ...AUDIO_IN, '-i', file, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', bitrate, '-write_xing', '1', '-id3v2_version', '3', '-f', 'mp3', mp3], { maxBuffer: 1 << 24 });
    const buf = await fs.readFile(mp3);
    if (isValidAudioBuffer(buf)) return { file: mp3, buf };
    console.warn('mp3 extract was not a valid audio file', { bytes: buf.length });
  } catch (e) {
    console.warn('mp3 extract failed', e?.message);
  }
  const m4a = `${outBase}.m4a`;
  await exec(ffmpegBin(), ['-y', '-hide_banner', '-loglevel', 'error', ...AUDIO_IN, '-i', file, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', bitrate, '-movflags', '+faststart', '-f', 'mp4', m4a], { maxBuffer: 1 << 24 });
  const buf = await fs.readFile(m4a);
  if (!isValidAudioBuffer(buf)) throw new Error('audio extract produced an invalid file');
  return { file: m4a, buf };
}

async function extractAudioSegment(src, dest, { start = 0, len, bitrate = '32k' } = {}) {
  const ext = path.extname(dest).toLowerCase();
  const ss = ['-ss', String(Math.max(0, start))];
  const t = len > 0 ? ['-t', String(len)] : [];
  if (ext === '.m4a' || ext === '.mp4') {
    await exec(ffmpegBin(), ['-y', '-hide_banner', '-loglevel', 'error', ...AUDIO_IN, ...ss, '-i', src, ...t, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', bitrate, '-movflags', '+faststart', '-f', 'mp4', dest], { maxBuffer: 1 << 24 });
  } else {
    await exec(ffmpegBin(), ['-y', '-hide_banner', '-loglevel', 'error', ...AUDIO_IN, ...ss, '-i', src, ...t, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', bitrate, '-write_xing', '1', '-id3v2_version', '3', '-f', 'mp3', dest], { maxBuffer: 1 << 24 });
  }
  const buf = await fs.readFile(dest);
  if (!isValidAudioBuffer(buf)) throw new Error('audio segment produced an invalid file');
  return buf;
}

// Audio -> 10-min mp3 chunks -> Whisper in parallel -> merged in source time.
// Groq's hourly audio quota is shared, so each run transcribes at most maxSec of audio:
// for longer videos we pick evenly spread chunks (clips still come from across the video).
// Chunks Groq can't take (quota) go to the fallback transcriber (Gemini) if given.
export async function localTranscript(file, dir, transcribeBuffer, { chunkSec = 600, limit = 4, maxSec = 2400, reserve, release, fallback } = {}) {
  const t0 = Date.now();
  const extracted = await extractWholeAudio(file, path.join(dir, 'audio-full'));
  const dur = (await probeDuration(extracted.file)) || 0;
  const all = [];
  if (!dur || dur <= chunkSec + 0.5) {
    all.push({ f: extracted.file, start: 0, len: Math.max(1, dur || chunkSec) });
  } else {
    const ext = path.extname(extracted.file) || '.mp3';
    for (let s = 0, i = 0; s < dur; s += chunkSec, i++) {
      const len = Math.min(chunkSec, dur - s);
      const dest = path.join(dir, `a${String(i).padStart(3, '0')}${ext}`);
      await extractAudioSegment(extracted.file, dest, { start: s, len });
      all.push({ f: dest, start: s, len });
    }
    fs.rm(extracted.file, { force: true }).catch(() => {});
  }
  const maxChunks = Math.max(1, Math.floor(maxSec / chunkSec));
  const rows = all.length <= maxChunks ? all
    : [...new Set(Array.from({ length: maxChunks }, (_, k) => Math.min(all.length - 1, Math.floor((k + 0.5) * all.length / maxChunks))))].map(k => all[k]);
  const out = new Array(rows.length);
  const via = { groq: 0, fallback: 0, none: 0 };
  let next = 0;
  let groqBlocked = false;
  await Promise.all(Array.from({ length: Math.min(limit, rows.length) }, async () => {
    while (next < rows.length) {
      const k = next++;
      const row = rows[k];
      const buf = await fs.readFile(row.f);
      fs.rm(row.f, { force: true }).catch(() => {}); // free /tmp as we go
      let tr = { segments: [] };
      if (!groqBlocked && (!reserve || await reserve(row.len))) {
        tr = await transcribeBuffer(buf);
        if (isGroqQuotaError(tr)) {
          groqBlocked = true;
          if (release) await release(row.len);
        } else if (!tr.segments.length) {
          // 400 invalid_media_file: retrying the same buffer is wasted time.
          if (Number(tr.status) !== 400) tr = await transcribeBuffer(buf);
          if (isGroqQuotaError(tr)) groqBlocked = true;
          if (!tr.segments.length) { if (release) await release(row.len); }
          else via.groq++;
        } else via.groq++;
      }
      if (!tr.segments.length && fallback) {
        tr = await fallback(buf, row.len).catch(() => ({ segments: [] }));
        if (tr.segments.length) via.fallback++;
      }
      if (!tr.segments.length) via.none++;
      out[k] = tr.segments.map(s => ({ start: s.start + row.start, end: s.end + row.start, text: s.text }));
    }
  }));
  const segments = out.flat();
  console.log('local transcript', { ms: Date.now() - t0, chunks: all.length, used: rows.length, via, words: segments.length });
  return { text: segments.map(s => s.text).join(' '), segments, partial: rows.length < all.length || via.none > 0, src: via.fallback || via.none ? 'mixed' : 'whisper' };
}

// Source time of the video keyframe a stream-copy cut starting at `start` really begins on.
// Input seeking with -c copy snaps back to the previous keyframe, so the segment starts up to
// a few seconds early; callers pass (start - keyframe) on as the offset RenderIO seeks to
// (it re-encodes, so that seek is frame-accurate) and captions stay on the spoken word.
async function firstVideoPts(file, start) {
  const r = await exec(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', ...(start > 0 ? ['-ss', String(start)] : []), '-i', file, '-map', '0:v:0', '-c', 'copy', '-copyts', '-frames:v', '1', '-f', 'framemd5', '-'], { maxBuffer: 1 << 20 });
  const out = String(r.stdout || '');
  const tb = out.match(/#tb 0: (\d+)\/(\d+)/);
  const pk = out.split('\n').find(l => /^0,\s*-?\d+/.test(l));
  if (!tb || !pk) return NaN;
  return Number(pk.split(',')[1]) * Number(tb[1]) / Number(tb[2]);
}
const zeroPts = new Map();
export async function keyframeAtOrBefore(file, start) {
  if (!(start > 0)) return 0;
  if (!zeroPts.has(file)) zeroPts.set(file, firstVideoPts(file, 0));
  const [p0, pk] = await Promise.all([zeroPts.get(file), firstVideoPts(file, start)]);
  const k = pk - p0;
  return Number.isFinite(k) && k <= start + 0.05 && k >= start - 20 ? Math.max(0, Math.min(k, start)) : start;
}

// Lossless stream-copy segment covering [start, start+len] uploaded to private Blob.
// Returns { url, offset }: the clip starts `offset` seconds into the segment.
// (Re-encoding here used to cost a generation of quality; RenderIO does the one encode.)
// ffmpeg args for one local segment. Video-only sources (some live captures) get a silent
// stereo AAC track so every clip has audio and later steps never map a missing stream.
export function segmentArgs(file, out, k, dur, { silent = false, reencode = false } = {}) {
  const head = ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(k), '-i', file];
  const vcodec = reencode ? ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18'] : ['-c:v', 'copy'];
  if (silent) {
    return [...head, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', String(dur), '-map', '0:v:0', '-map', '1:a:0',
      ...vcodec, '-c:a', 'aac', '-b:a', '64k', '-shortest', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', out];
  }
  if (!reencode) return [...head, '-t', String(dur), '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', out];
  return [...head, '-t', String(dur), '-map', '0:v:0', '-map', '0:a:0?', ...vcodec, '-c:a', 'aac', '-ac', '2', '-movflags', '+faststart', out];
}

const SEGMENT_DIRECT_MAX = Number(process.env.SEGMENT_DIRECT_MAX_MB || 200) * 1e6;
export async function segmentToBlob(file, dir, start, len, tag) {
  const out = path.join(dir, `seg_${tag}.mp4`);
  const s0 = Math.max(0, start);
  const k = await keyframeAtOrBefore(file, s0).catch(() => s0);
  const offset = Math.max(0, s0 - k);
  const dur = String(len + offset + 0.5);
  const silent = !(await hasAudioStream(file));
  const copyArgs = segmentArgs(file, out, k, dur, { silent, reencode: false });
  // /tmp is shared by every job on the instance; when it is full, skip the local segment and
  // hand RenderIO the source file itself (small per-clip HQ cuts) with the clip's offset.
  const direct = async (why) => {
    const st = await fs.stat(file);
    if (!(st.size > 0) || st.size > SEGMENT_DIRECT_MAX) throw why;
    console.warn('segment: disk full; uploading the source cut as-is', { mb: Math.round(st.size / 1e6) });
    const blob = await put(`segments/${Date.now()}_${tag}.mp4`, await fs.readFile(file), { access: 'private', contentType: 'video/mp4', addRandomSuffix: true });
    return { url: await toRenderUrl(blob.url), offset: Math.round(s0 * 1000) / 1000 };
  };
  try {
    await exec(ffmpegBin(), copyArgs, { maxBuffer: 1 << 24 });
  } catch (e) {
    await fs.rm(out, { force: true }).catch(() => {});
    if (isNoSpace(e)) return direct(e);
    // Mid-GOP / AAC timestamp mismatches make -c copy fail on some sources. Re-encode
    // the short segment; RenderIO still does the final quality encode from this file.
    console.warn('segment copy failed; re-encoding', e?.message);
    try {
      await exec(ffmpegBin(), segmentArgs(file, out, k, dur, { silent, reencode: true }), { maxBuffer: 1 << 24 });
    } catch (e2) {
      await fs.rm(out, { force: true }).catch(() => {});
      if (isNoSpace(e2)) return direct(e2);
      throw e2;
    }
  }
  const buf = await fs.readFile(out);
  fs.rm(out, { force: true }).catch(() => {});
  const blob = await put(`segments/${Date.now()}_${tag}.mp4`, buf, { access: 'private', contentType: 'video/mp4', addRandomSuffix: true });
  // RenderIO reads the segment straight from Blob through a short-lived presigned URL.
  return { url: await toRenderUrl(blob.url), offset: Math.round(offset * 1000) / 1000 };
}

// Exact-start mono audio of [start, start+len] (decoded seek, so sample-accurate) for
// per-clip Whisper word timings.
export async function clipAudio(file, dir, start, len, tag) {
  if (!(await hasAudioStream(file))) throw noAudioError();
  const out = path.join(dir, `aud_${tag}.mp3`);
  const buf = await extractAudioSegment(file, out, { start: Math.max(0, start), len, bitrate: '48k' });
  fs.rm(out, { force: true }).catch(() => {});
  return buf;
}

// Duration of a remote MP4 without pulling it: ffmpeg reads the header over HTTP and uses
// range requests to reach the moov atom even when it sits at the end. Returns seconds or 0.
export async function probeRemoteDuration(url, _file, _bytes, timeoutMs = 20000) {
  try {
    const r = await exec(ffmpegBin(), ['-hide_banner', '-rw_timeout', String(timeoutMs * 1000), '-i', url], { timeout: timeoutMs }).catch(e => e);
    const m = String(r?.stderr || '').match(/Duration: (\d+):(\d+):([\d.]+)/);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
  } catch { return 0; }
}

// ---- /tmp hygiene ----
// One Fluid instance runs several jobs at once and they share a 512 MB /tmp. Jobs killed at
// the 300s limit never reach their cleanup, so their files pile up until pulls fail with
// ENOSPC. Each job sweeps work dirs older than any live invocation could be, and sizes its
// pull budget from the space that's actually free, split with the jobs running beside it.
export const isNoSpace = (e) => e?.code === 'ENOSPC' || e?.cause?.code === 'ENOSPC' || /ENOSPC|no space left on device/i.test(String(e?.message || ''));
const TMP_STALE_MS = Number(process.env.TMP_STALE_MS || 6 * 60 * 1000); // > maxDuration (300s)
const TMP_RESERVE = Number(process.env.TMP_RESERVE_MB || 48) * 1e6; // audio, segments, HQ cuts
let lastSweep = 0;

export async function sweepStaleTmp({ prefix = 'clip-', dir = os.tmpdir(), now = Date.now(), staleMs = TMP_STALE_MS, force = false } = {}) {
  if (!force && now - lastSweep < 30000) return { removed: 0 };
  lastSweep = now;
  let removed = 0;
  const names = await fs.readdir(dir).catch(() => []);
  await Promise.all(names.filter(n => n.startsWith(prefix)).map(async (n) => {
    const full = path.join(dir, n);
    const st = await fs.stat(full).catch(() => null);
    if (st && now - st.mtimeMs > staleMs) { await fs.rm(full, { recursive: true, force: true }).catch(() => {}); removed++; }
  }));
  if (removed) console.log('tmp sweep', { removed });
  return { removed };
}

// Bytes this job may pull into `own` (its work dir): free space minus a reserve, shared with
// the other live work dirs, never above `max`.
export async function tmpBudget(own, max, { prefix = 'clip-', dir = os.tmpdir(), statfs = fs.statfs } = {}) {
  try {
    const st = await statfs(dir);
    const free = Number(st.bavail) * Number(st.bsize);
    const names = await fs.readdir(dir).catch(() => []);
    const others = names.filter(n => n.startsWith(prefix) && path.join(dir, n) !== own).length;
    const share = Math.floor(Math.max(0, free - TMP_RESERVE) / (1 + others));
    return Math.max(16e6, Math.min(max, share));
  } catch { return max; }
}
