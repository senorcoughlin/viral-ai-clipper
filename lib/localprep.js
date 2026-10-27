import { Transform } from 'stream';
// Local (in-function) prep for downloaded sources: the file is pulled once into /tmp,
// audio is extracted and transcribed in parallel chunks here, and each clip gets a small
// pre-trimmed segment in Blob so RenderIO only ever touches a few MB per job.
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
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

// Counts bytes and fails with err.tooBig once maxBytes is passed (protects the 512 MB /tmp).
function byteCap(maxBytes) {
  let n = 0;
  return new Transform({ transform(chunk, _e, cb) { n += chunk.length; if (maxBytes && n > maxBytes) { const e = new Error('source larger than ' + Math.round(maxBytes / 1e6) + ' MB'); e.tooBig = true; return cb(e); } cb(null, chunk); } });
}
export async function downloadToFile(url, file, timeoutMs = 120000, headers = {}, blobPath = null, maxBytes = 0) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store', headers });
    if (!r.ok || !r.body) throw new Error('source fetch ' + r.status);
    if (blobPath) {
      // Write to /tmp and stream the same bytes into private Blob (for a follow-up invocation).
      const [a, b] = r.body.tee();
      const up = put(blobPath, Readable.fromWeb(b), { access: 'private', contentType: 'video/mp4', addRandomSuffix: true, multipart: true, abortSignal: ctrl.signal });
      up.catch(() => {}); // never leave the upload's rejection unhandled (an abort used to crash the process)
      const t0 = Date.now();
      try { await pipeline(Readable.fromWeb(a), byteCap(maxBytes), createWriteStream(file)); }
      catch (e) { ctrl.abort(); const n = await fs.stat(file).then(x => x.size).catch(() => 0); console.warn('source pull aborted', { mb: Math.round(n / 1e6), sec: Math.round((Date.now() - t0) / 1000), len: r.headers.get('content-length'), type: r.headers.get('content-type') }); throw e; }
      const blob = await up;
      const st = await fs.stat(file);
      if (st.size < 1000) throw new Error('source file empty: ' + await tinyBody(file, r));
      return { size: st.size, blobUrl: blob.url };
    }
    await pipeline(Readable.fromWeb(r.body), byteCap(maxBytes), createWriteStream(file));
    const st = await fs.stat(file);
    if (st.size < 1000) throw new Error('source file empty: ' + await tinyBody(file, r));
    return { size: st.size };
  } finally { clearTimeout(t); }
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
