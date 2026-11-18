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
import { toFetchable } from './media';

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
    r = await fetch(url, { signal: headerSignal, cache: 'no-store', headers: h });
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
      return blobPath ? { size: res.size, blobUrl: res.blobUrl } : { size: res.size };
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      const n = await fs.stat(file).then(x => x.size).catch(() => 0);
      console.warn('source pull aborted', { mb: Math.round(n / 1e6), sec: Math.round((Date.now() - t0) / 1000), attempt, resume: n > 0 && !e?.tooBig && !e?.deadline, stalled: !!e?.stalled, deadline: !!e?.deadline, err: String(e?.message || e).slice(0, 120) });
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

// Audio -> 10-min mp3 chunks -> Whisper in parallel -> merged in source time.
// Groq's hourly audio quota is shared, so each run transcribes at most maxSec of audio:
// for longer videos we pick evenly spread chunks (clips still come from across the video).
// Chunks Groq can't take (quota) go to the fallback transcriber (Gemini) if given.
export async function localTranscript(file, dir, transcribeBuffer, { chunkSec = 600, limit = 4, maxSec = 2400, reserve, release, fallback } = {}) {
  const t0 = Date.now();
  const list = path.join(dir, 'chunks.csv');
  await exec(ffmpegBin(), ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000',
    '-c:a', 'libmp3lame', '-b:a', '32k', '-f', 'segment', '-segment_time', String(chunkSec), '-segment_list', list,
    '-segment_list_type', 'csv', path.join(dir, 'a%03d.mp3')], { maxBuffer: 1 << 24 });
  const all = (await fs.readFile(list, 'utf8')).trim().split('\n').map(l => { const [f, s, e] = l.split(','); return { f: path.join(dir, f), start: Number(s) || 0, len: Math.max(1, (Number(e) || 0) - (Number(s) || 0)) }; });
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
      let tr = { segments: [] };
      if (!groqBlocked && (!reserve || await reserve(row.len))) {
        tr = await transcribeBuffer(buf);
        if (!tr.segments.length) { tr = await transcribeBuffer(buf); }
        if (!tr.segments.length) { groqBlocked = true; if (release) await release(row.len); }
        else via.groq++;
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
export async function segmentToBlob(file, dir, start, len, tag) {
  const out = path.join(dir, `seg_${tag}.mp4`);
  const s0 = Math.max(0, start);
  const k = await keyframeAtOrBefore(file, s0).catch(() => s0);
  const offset = Math.max(0, s0 - k);
  await exec(ffmpegBin(), ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(k), '-i', file, '-t', String(len + offset + 0.5), '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', out], { maxBuffer: 1 << 24 });
  const buf = await fs.readFile(out);
  const blob = await put(`segments/${Date.now()}_${tag}.mp4`, buf, { access: 'private', contentType: 'video/mp4', addRandomSuffix: true });
  fs.rm(out, { force: true }).catch(() => {});
  return { url: toFetchable(blob.url), offset: Math.round(offset * 1000) / 1000 };
}

// Exact-start mono audio of [start, start+len] (decoded seek, so sample-accurate) for
// per-clip Whisper word timings.
export async function clipAudio(file, dir, start, len, tag) {
  const out = path.join(dir, `aud_${tag}.mp3`);
  await exec(ffmpegBin(), ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(Math.max(0, start)), '-i', file, '-t', String(len), '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k', out], { maxBuffer: 1 << 24 });
  const buf = await fs.readFile(out);
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
