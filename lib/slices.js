// Long YouTube videos: the download CDN streams every file from byte 0 at ~0.2-1 MB/s and
// ignores Range, so one 300s invocation can't pull a 40+ minute source (or resume it in the
// next one). Instead the video is fetched as independent time slices (provider-side
// start_time/end_time cuts) at a light resolution, several at a time. Each finished slice is
// saved to Blob and recorded in KV, so a fresh invocation (hand-off) or a later run of the
// same video only fetches what's still missing. Slices overlap by more than one clip length,
// so any clip fits inside a single slice; slice time 0 is exactly its nominal start.
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { put } from '@vercel/blob';
import { kvGetJson, kvSetJson } from './kv';
import { ffmpegPath } from './ffmpegbin';
import { downloadToFile, probeDuration } from './localprep';

const exec = promisify(execFile);

export const SLICE_MIN_SEC = Number(process.env.SLICE_MIN_SEC || 6 * 60); // shorter videos keep the single-file pull
export const SLICE_SEC = Number(process.env.SLICE_SEC || 360);
export const SLICE_CONC = Number(process.env.SLICE_CONC || 12);
export const SLICE_MAX_HOPS = Number(process.env.SLICE_MAX_HOPS || 3); // extra invocations a run may hand off to
export const HQ_CLIP_FORMAT = process.env.YT_CLIP_FORMAT || '720';
const SLICE_TTL = 7 * 24 * 3600;

// Light analysis resolution: the transcript only needs the audio, and clips are re-fetched
// at HQ_CLIP_FORMAT around each picked moment (this tier is only the fallback picture).
export function sliceFormat(secs) {
  if (process.env.YT_SLICE_FORMAT) return process.env.YT_SLICE_FORMAT;
  return secs <= 15 * 60 ? '360' : '240';
}

export function shouldSlice(secs) {
  return Number(secs) > SLICE_MIN_SEC;
}

// Overlap fixed at 60s for the usual clip lengths so runs with different lengths share slices.
export function sliceOverlap(clipLength) {
  const len = Number(clipLength) || 30;
  return len <= 55 ? 60 : Math.ceil(len + 5);
}

export function planSlices(durSec, clipLength = 30, sliceSec = SLICE_SEC) {
  const dur = Math.ceil(Number(durSec) || 0);
  const ov = sliceOverlap(clipLength);
  const S = Math.max(sliceSec, 2 * ov);
  const out = [];
  for (let k = 0; k * S < dur; k++) {
    const start = k * S;
    const end = Math.min(dur, start + S + ov);
    out.push({ k, start, end });
    if (end >= dur) break;
  }
  return { dur, S, ov, slices: out };
}

export const sliceKey = (ytId, fmt, plan, k) => `yslc1:${ytId}:${fmt}:${plan.S}:${plan.ov}:${plan.dur}:${k}`;

// The slice holding [start, start+len] entirely, else the one covering most of it.
export function sliceFor(slices, start, len) {
  const fits = slices.find(s => s.start <= start + 0.01 && start + len <= s.end + 0.01);
  const pick = fits || slices.reduce((best, s) => {
    const cover = Math.min(s.end, start + len) - Math.max(s.start, start);
    return !best || cover > best.cover ? { ...s, cover } : best;
  }, null);
  return { ...pick, rel: Math.max(0, start - pick.start) };
}

const nowLeft = (deadline) => deadline - Date.now();
export const slicePendingKey = (ytId, fmt, plan, k) => `yslp1:${ytId}:${fmt}:${plan.S}:${plan.ov}:${plan.dur}:${k}`;
const PENDING_TTL = 45 * 60; // provider file links live ~1 hour

// Fetch every slice not yet on disk: from Blob when an earlier invocation saved it, otherwise
// from the provider. Provider jobs are started for every missing slice right away (they keep
// preparing on the provider's side even after this invocation ends; their progress URL is kept
// in KV so the next invocation polls the same job instead of starting over). Returns which
// slices are local and which are still missing.
export async function fetchSlices({ videoUrl, ytId, fmt, plan, dir, deadline, start, poll, conc = SLICE_CONC, maxBytes = 0,
  blobHeaders = {}, download = downloadToFile, upload = uploadSlice, kvGet = kvGetJson, kvSet = kvSetJson, minPullMs = 25000 }) {
  const t0 = Date.now();
  const files = new Map();
  const stats = { fromBlob: 0, pulled: 0, failed: 0, pending: 0, resumed: 0, bytes: 0 };
  const keys = plan.slices.map(s => sliceKey(ytId, fmt, plan, s.k));
  const pkeys = plan.slices.map(s => slicePendingKey(ytId, fmt, plan, s.k));
  const [saved, pending] = await Promise.all([
    Promise.all(keys.map(k => kvGet(k).catch(() => null))),
    Promise.all(pkeys.map(k => kvGet(k).catch(() => null))),
  ]);
  const todo = plan.slices.map((s, i) => ({ s, i, blob: saved[i]?.blob || null, pend: pending[i]?.p || pending[i]?.u ? pending[i] : null }));
  let total = 0;
  const work = async ({ s, i, blob, pend }) => {
    const file = path.join(dir, `slice_${s.k}.mp4`);
    if (blob) {
      try {
        const res = await download(blob, file, Math.max(5000, Math.min(60000, nowLeft(deadline))), blobHeaders, null, 0, { maxAttempts: 2 });
        files.set(s.k, file); stats.fromBlob++; stats.bytes += res.size; total += res.size;
        return;
      } catch (e) { console.warn('slice blob read failed; re-pulling', { k: s.k, err: e?.message }); }
    }
    if (pend) stats.resumed++;
    const clear = () => kvSet(pkeys[i], {}, 1).catch(() => {});
    for (let attempt = 1; attempt <= 2; attempt++) {
      const ts = Date.now();
      try {
        if (!pend) {
          if (nowLeft(deadline) < 3000) return;
          pend = { p: await start({ startTime: s.start, endTime: s.end, format: fmt }), at: Date.now() };
          await kvSet(pkeys[i], pend, PENDING_TTL);
        }
        let u = pend.u;
        if (!u) {
          const wait = nowLeft(deadline) - minPullMs;
          if (wait < 2000) { stats.pending++; return; } // the next invocation keeps polling this job
          u = await poll(pend.p, wait);
          pend = { ...pend, u };
          await kvSet(pkeys[i], pend, PENDING_TTL);
        }
        const resolveSec = Math.round((Date.now() - (pend.at || ts)) / 1000);
        const left = nowLeft(deadline) - 2000;
        if (left < 5000) { stats.pending++; return; }
        const res = await download(u, file, left, {}, null, maxBytes ? Math.max(1, maxBytes - total) : 0, { maxAttempts: 2 });
        const sec = await probeDuration(file).catch(() => 0);
        const want = s.end - s.start;
        if (sec && sec < want * 0.9 - 2) throw new Error(`slice short: ${sec.toFixed(1)}s of ${want}s`);
        total += res.size; stats.bytes += res.size; stats.pulled++;
        files.set(s.k, file);
        console.log('slice pulled', { k: s.k, fmt, start: s.start, end: s.end, mb: +(res.size / 1e6).toFixed(1), jobSec: resolveSec, sec: Math.round((Date.now() - ts) / 1000) });
        // Save for the next invocation / next run; never block on it failing.
        try {
          const url = await upload(`slices/${ytId}/${fmt}_${plan.S}_${plan.ov}_${s.k}.mp4`, file);
          if (url) { await kvSet(keys[i], { blob: url }, SLICE_TTL); clear(); }
        } catch (e) { console.warn('slice save failed', { k: s.k, err: e?.message }); }
        return;
      } catch (e) {
        await fs.rm(file, { force: true }).catch(() => {});
        console.warn('slice pull failed', { k: s.k, attempt, sec: Math.round((Date.now() - ts) / 1000), timeout: !!e?.timeout, err: String(e?.message || e).slice(0, 120) });
        if (e?.tooBig) { stats.failed++; throw e; }
        if (e?.timeout || e?.deadline) { stats.pending++; return; } // still preparing / out of time: leave the job for the next invocation
        pend = null; await clear(); // provider gave up, or the link broke: start a fresh job
      }
    }
    stats.failed++;
  };
  // Start a provider job for every slice that has none yet, all at once: they prepare in
  // parallel on the provider's side while we download the ones that are ready.
  await Promise.all(todo.filter(t => !t.blob && !t.pend).map(async (t) => {
    try {
      t.pend = { p: await start({ startTime: t.s.start, endTime: t.s.end, format: fmt }), at: Date.now() };
      await kvSet(pkeys[t.i], t.pend, PENDING_TTL);
    } catch (e) { console.warn('slice job start failed', { k: t.s.k, err: String(e?.message || e).slice(0, 120) }); }
  }));
  // Cached slices first (fast), then provider jobs, `conc` at a time.
  todo.sort((a, b) => (b.blob ? 1 : 0) - (a.blob ? 1 : 0));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(conc, todo.length) || 1 }, async () => {
    while (next < todo.length) { const j = todo[next++]; await work(j); }
  }));
  const missing = plan.slices.filter(s => !files.has(s.k)).map(s => s.k);
  console.log('slices', { ytId, fmt, n: plan.slices.length, have: files.size, missing: missing.length, ...stats, mb: +(stats.bytes / 1e6).toFixed(1), sec: Math.round((Date.now() - t0) / 1000) });
  return { files, missing, stats };
}

export async function uploadSlice(blobPath, file) {
  const buf = await fs.readFile(file);
  const b = await put(blobPath, buf, { access: 'private', contentType: 'video/mp4', addRandomSuffix: true });
  return b.url;
}

// One mono 16 kHz track of the whole video in source time: each slice contributes only its
// non-overlapping part [0, S) (the last one all of it). Feeds the normal chunked transcript.
export async function buildSliceAudio(plan, files, out) {
  const bin = ffmpegPath(); if (!bin) throw new Error('ffmpeg missing');
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  const parts = [];
  plan.slices.forEach((s, i) => {
    args.push('-i', files.get(s.k));
    const keep = i < plan.slices.length - 1 ? plan.slices[i + 1].start - s.start : s.end - s.start;
    parts.push(`[${i}:a:0]atrim=0:${keep},asetpts=PTS-STARTPTS,aresample=16000,aformat=channel_layouts=mono[a${i}]`);
  });
  const filter = parts.join(';') + ';' + plan.slices.map((_, i) => `[a${i}]`).join('') + `concat=n=${plan.slices.length}:v=0:a=1[a]`;
  args.push('-filter_complex', filter, '-map', '[a]', '-c:a', 'libmp3lame', '-b:a', '32k', out);
  await exec(bin, args, { maxBuffer: 1 << 24 });
  return out;
}

// Higher-resolution cut around one picked clip (padding for the keyframe snap). Returns
// { file, rel } with rel = clip start inside that file, or throws.
export async function hqClipCut({ resolve, download = downloadToFile, dir, start, len, dur, tag, deadline, format = HQ_CLIP_FORMAT }) {
  const s0 = Math.max(0, Math.floor(start) - 2);
  const e0 = Math.min(Math.ceil(dur || start + len + 2), Math.ceil(start + len) + 2);
  const t = Date.now();
  const u = await resolve({ startTime: s0, endTime: e0, format, timeoutMs: Math.max(10000, nowLeft(deadline) - 5000) });
  const file = path.join(dir, `hq_${tag}.mp4`);
  const left = nowLeft(deadline);
  if (left < 3000) throw new Error('hq cut out of time');
  const res = await download(u, file, left, {}, null, 0, { maxAttempts: 2 });
  const sec = await probeDuration(file).catch(() => 0);
  if (sec && sec < (e0 - s0) * 0.9 - 1) throw new Error(`hq cut short: ${sec.toFixed(1)}s of ${e0 - s0}s`);
  console.log('hq clip cut', { tag, format, mb: +(res.size / 1e6).toFixed(1), sec: Math.round((Date.now() - t) / 1000) });
  return { file, rel: start - s0 };
}
