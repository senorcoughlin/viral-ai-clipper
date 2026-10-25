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
const ffmpegBin = () => require('ffmpeg-static');

export async function downloadToFile(url, file, timeoutMs = 120000, headers = {}, blobPath = null) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store', headers });
    if (!r.ok || !r.body) throw new Error('source fetch ' + r.status);
    if (blobPath) {
      // Write to /tmp and stream the same bytes into private Blob (for a follow-up invocation).
      const [a, b] = r.body.tee();
      const up = put(blobPath, Readable.fromWeb(b), { access: 'private', contentType: 'video/mp4', addRandomSuffix: true, multipart: true });
      await pipeline(Readable.fromWeb(a), createWriteStream(file));
      const blob = await up;
      const st = await fs.stat(file);
      return { size: st.size, blobUrl: blob.url };
    }
    await pipeline(Readable.fromWeb(r.body), createWriteStream(file));
    const st = await fs.stat(file);
    if (st.size < 1000) throw new Error('source file empty');
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
  return { text: segments.map(s => s.text).join(' '), segments, partial: rows.length < all.length || via.none > 0 };
}

// Re-encoded [start, start+len] segment (exact start at 0) uploaded to private Blob.
export async function segmentToBlob(file, dir, start, len, tag) {
  const out = path.join(dir, `seg_${tag}.mp4`);
  await exec(ffmpegBin(), ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(Math.max(0, start)), '-i', file, '-t', String(len),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], { maxBuffer: 1 << 24 });
  const buf = await fs.readFile(out);
  const blob = await put(`segments/${Date.now()}_${tag}.mp4`, buf, { access: 'private', contentType: 'video/mp4', addRandomSuffix: true });
  fs.rm(out, { force: true }).catch(() => {});
  return toFetchable(blob.url);
}
