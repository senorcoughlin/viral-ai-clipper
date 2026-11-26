import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

process.env.YT_DOWNLOAD_API_KEY = process.env.YT_DOWNLOAD_API_KEY || 'test-key-not-real';

const { downloadToFile } = await import('../lib/localprep.js');
const { isInsufficientBalance, isDurationLimitError, downloadViaApi, downloadViaRapid, downloadApiDown, _resetDownloadApiDownForTests } = await import('../lib/downloader.js');

function bytes(n, fill = 7) { return new Uint8Array(n).fill(fill); }

function streamChunks(chunks, { hangAfter = -1, hangMs = 60_000, delayMs = 0 } = {}) {
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (hangAfter >= 0 && i === hangAfter) {
        await new Promise(r => setTimeout(r, hangMs));
        return;
      }
      if (i >= chunks.length) { controller.close(); return; }
      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
      controller.enqueue(chunks[i++]);
    },
  });
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('short download writes the full body and does not resume', async () => {
  const file = path.join(os.tmpdir(), `vac-dl-${Date.now()}-short.bin`);
  const payload = bytes(4096, 9);
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(streamChunks([payload]), { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': String(payload.length) } });
  };
  try {
    const res = await downloadToFile('https://example.test/v.mp4', file, 5000, {}, null, 0, { stallMs: 1000, maxAttempts: 3 });
    assert.equal(res.size, 4096);
    assert.equal((await fs.readFile(file)).length, 4096);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = orig;
    await fs.rm(file, { force: true });
  }
});

test('a slowly progressing download is not killed by the stall timer', async () => {
  const file = path.join(os.tmpdir(), `vac-dl-${Date.now()}-slow.bin`);
  const chunks = Array.from({ length: 6 }, (_, i) => bytes(800, i + 1));
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(streamChunks(chunks, { delayMs: 120 }), { status: 200, headers: { 'content-type': 'video/mp4' } });
  try {
    const res = await downloadToFile('https://example.test/v.mp4', file, 4000, {}, null, 0, { stallMs: 400, maxAttempts: 1 });
    assert.equal(res.size, 4800);
  } finally {
    globalThis.fetch = orig;
    await fs.rm(file, { force: true });
  }
});

test('stalled download resumes with HTTP Range and completes', async () => {
  const file = path.join(os.tmpdir(), `vac-dl-${Date.now()}-resume.bin`);
  const first = bytes(1500, 1);
  const rest = bytes(2500, 2);
  const orig = globalThis.fetch;
  const ranges = [];
  globalThis.fetch = async (url, init) => {
    const range = init?.headers?.Range || init?.headers?.range || '';
    ranges.push(range || '');
    if (!range) {
      return new Response(streamChunks([first], { hangAfter: 1, hangMs: 5000 }), { status: 200, headers: { 'content-type': 'video/mp4' } });
    }
    const start = Number(String(range).replace(/bytes=/, '').split('-')[0]);
    assert.equal(start, first.length);
    return new Response(streamChunks([rest]), { status: 206, headers: { 'content-type': 'video/mp4', 'content-range': `bytes ${start}-${start + rest.length - 1}/${start + rest.length}` } });
  };
  try {
    const res = await downloadToFile('https://example.test/v.mp4', file, 8000, {}, null, 0, { stallMs: 200, maxAttempts: 3 });
    assert.equal(res.size, 4000);
    const buf = await fs.readFile(file);
    assert.equal(buf.length, 4000);
    assert.deepEqual(buf.subarray(0, 1500), Buffer.from(first));
    assert.deepEqual(buf.subarray(1500), Buffer.from(rest));
    assert.equal(ranges.length, 2);
    assert.equal(ranges[1], 'bytes=1500-');
  } finally {
    globalThis.fetch = orig;
    await fs.rm(file, { force: true });
  }
});

test('too-large sources fail with tooBig and do not keep retrying', async () => {
  const file = path.join(os.tmpdir(), `vac-dl-${Date.now()}-big.bin`);
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(streamChunks([bytes(5000)]), { status: 200, headers: { 'content-type': 'video/mp4' } });
  };
  try {
    await assert.rejects(
      () => downloadToFile('https://example.test/v.mp4', file, 5000, {}, null, 2000, { stallMs: 1000, maxAttempts: 4 }),
      (e) => e?.tooBig === true,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = orig;
    await fs.rm(file, { force: true });
  }
});

test('isInsufficientBalance matches the production error body', () => {
  const body = { error_code: 'insufficient_balance', message: 'Not enough balance', successfull: false, top_up_url: 'https://video-download-api.com/dashboard/billing' };
  assert.equal(isInsufficientBalance(body, 400), true);
  assert.equal(isInsufficientBalance({ message: 'ok' }, 400), false);
  assert.equal(isInsufficientBalance(body, 200), false);
});

test('isDurationLimitError matches the provider\'s extended-duration rejection', () => {
  const body = { message: 'This video exceeds the standard duration limit for this format. Extended duration permission required.', success: false };
  assert.equal(isDurationLimitError(body.message, body), true);
  assert.equal(isDurationLimitError(new Error(body.message), body), true);
  const e = new Error(body.message); e.durationLimit = true;
  assert.equal(isDurationLimitError(e), true);
  assert.equal(isDurationLimitError('download api timeout'), false);
  assert.equal(isDurationLimitError({ message: 'ok' }, { message: 'ok' }), false);
});

test('downloadViaRapid tags duration-limit rejections so callers skip RenderIO', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: false,
    message: 'This video exceeds the standard duration limit for this format. Extended duration permission required.',
  }), { status: 400, headers: { 'content-type': 'application/json' } });
  try {
    await assert.rejects(
      () => downloadViaRapid('https://youtu.be/dQw4w9wgGcQ', 5000),
      (e) => e?.durationLimit === true && /duration limit/i.test(e.message),
    );
  } finally {
    globalThis.fetch = orig;
  }
});


test('downloadViaApi treats insufficient_balance as a fast skip and remembers it', async () => {
  _resetDownloadApiDownForTests();
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return jsonResponse(400, { error_code: 'insufficient_balance', message: 'Not enough balance', successfull: false });
  };
  try {
    await assert.rejects(() => downloadViaApi('https://youtu.be/dQw4w9wgGcQ', 120000), (e) => e?.insufficientBalance === true);
    assert.equal(calls, 1);
    assert.equal(await downloadApiDown(), true);
    const t0 = Date.now();
    await assert.rejects(() => downloadViaApi('https://youtu.be/dQw4w9wgGcQ', 120000), (e) => e?.insufficientBalance === true);
    assert.ok(Date.now() - t0 < 500, 'second call should skip without waiting on the API');
    assert.equal(calls, 1, 'down-key must prevent a second HTTP call');
  } finally {
    globalThis.fetch = orig;
    _resetDownloadApiDownForTests();
  }
});

// ---- Long-video time slices (lib/slices.js) ----
const slices = await import('../lib/slices.js');
const { execFileSync } = await import('node:child_process');
const { ffmpegPath } = await import('../lib/ffmpegbin.js');

test('planSlices covers the whole video with overlap > clip length', () => {
  const p = slices.planSlices(4036, 30, 360);
  assert.equal(p.ov, 60);
  assert.equal(p.slices[0].start, 0);
  assert.equal(p.slices.at(-1).end, 4036);
  for (let i = 1; i < p.slices.length; i++) {
    assert.equal(p.slices[i].start, i * p.S);
    assert.ok(p.slices[i - 1].end - p.slices[i].start >= 60, 'adjacent slices overlap by >= 60s');
  }
  // Every possible 30s clip fits wholly inside one slice.
  for (let t = 0; t + 30 <= 4036; t += 7) {
    const s = slices.sliceFor(p.slices, t, 30);
    assert.ok(s.start <= t && t + 30 <= s.end, `clip at ${t} fits`);
    assert.equal(s.rel, t - s.start);
  }
  // Long clips widen the overlap and the slice size.
  const q = slices.planSlices(3600, 300, 360);
  assert.equal(q.ov, 305);
  assert.ok(q.S >= 610);
  assert.ok(slices.sliceFor(q.slices, 1234, 300).end >= 1534);
});

test('slicing is only for videos over the threshold, light formats for long ones', () => {
  assert.equal(slices.shouldSlice(120), false);
  assert.equal(slices.shouldSlice(slices.SLICE_MIN_SEC), false);
  assert.equal(slices.shouldSlice(slices.SLICE_MIN_SEC + 1), true);
  assert.equal(slices.sliceFormat(10 * 60), '360');
  assert.equal(slices.sliceFormat(67 * 60), '240');
});

function fakeSliceEnv({ saved = {}, failK = new Set(), slowK = new Set() } = {}) {
  const calls = { start: [], poll: [], download: [], upload: [], kvSet: [] };
  const kv = new Map(Object.entries(saved));
  const tries = new Map();
  return {
    calls, kv,
    start: async ({ startTime, endTime, format }) => {
      calls.start.push({ startTime, endTime, format });
      const k = startTime / 360;
      tries.set(k, (tries.get(k) || 0) + 1);
      return `https://p.example/progress?k=${k}&try=${tries.get(k)}&f=${format}&s=${startTime}&e=${endTime}`;
    },
    poll: async (p, timeoutMs) => {
      calls.poll.push(p);
      const q = new URL(p).searchParams; const k = Number(q.get('k'));
      if (failK.has(k)) { const e = new Error('download api failed'); e.failed = true; throw e; }
      if (slowK.has(k)) { await new Promise(r => setTimeout(r, Math.min(timeoutMs, 50))); const e = new Error('download api timeout'); e.timeout = true; throw e; }
      return `https://cdn.example/${q.get('f')}/${q.get('s')}-${q.get('e')}.mp4`;
    },
    download: async (u, file) => {
      calls.download.push(u);
      await fs.writeFile(file, bytes(2000, 1));
      return { size: 2000 };
    },
    upload: async (p) => { calls.upload.push(p); return `https://blob.example/${p}`; },
    kvGet: async (k) => kv.get(k) || null,
    kvSet: async (k, v) => { calls.kvSet.push(k); kv.set(k, v); return true; },
  };
}

test('fetchSlices pulls every slice in parallel, saves each to Blob + KV', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-sl-'));
  const plan = slices.planSlices(1500, 30, 360);
  const env = fakeSliceEnv();
  const r = await slices.fetchSlices({ videoUrl: 'https://youtu.be/x', ytId: 'abc', fmt: '240', plan, dir, deadline: Date.now() + 60000, conc: 3, minPullMs: 0, ...env });
  assert.deepEqual(r.missing, []);
  assert.equal(r.files.size, plan.slices.length);
  assert.equal(env.calls.start.length, plan.slices.length);
  assert.ok(env.calls.start.every(c => c.format === '240'));
  for (const sl of plan.slices) {
    assert.ok(env.kv.get(slices.sliceKey('abc', '240', plan, sl.k))?.blob, 'slice saved');
    assert.ok(!env.kv.get(slices.slicePendingKey('abc', '240', plan, sl.k))?.p, 'pending job cleared');
  }
  await fs.rm(dir, { recursive: true, force: true });
});

test('fetchSlices re-reads saved slices from Blob and only pulls the missing ones', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-sl-'));
  const plan = slices.planSlices(1500, 30, 360);
  const saved = { [slices.sliceKey('abc', '240', plan, 0)]: { blob: 'https://blob.example/s0' }, [slices.sliceKey('abc', '240', plan, 2)]: { blob: 'https://blob.example/s2' } };
  const env = fakeSliceEnv({ saved });
  const r = await slices.fetchSlices({ videoUrl: 'u', ytId: 'abc', fmt: '240', plan, dir, deadline: Date.now() + 60000, minPullMs: 0, ...env });
  assert.deepEqual(r.missing, []);
  assert.equal(r.stats.fromBlob, 2);
  assert.equal(env.calls.start.length, plan.slices.length - 2);
  assert.ok(!env.calls.start.some(c => c.startTime === 0 || c.startTime === 720));
  await fs.rm(dir, { recursive: true, force: true });
});

test('fetchSlices retries a failed provider job, then reports it missing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-sl-'));
  const plan = slices.planSlices(1500, 30, 360);
  const env = fakeSliceEnv({ failK: new Set([1]) });
  const r = await slices.fetchSlices({ videoUrl: 'u', ytId: 'abc', fmt: '240', plan, dir, deadline: Date.now() + 60000, minPullMs: 0, ...env });
  assert.deepEqual(r.missing, [1]);
  assert.equal(env.calls.start.filter(c => c.startTime === 360).length, 3, 'fresh jobs after the provider gave up, then marked missing');
  assert.equal(r.stats.failed, 1);
  await fs.rm(dir, { recursive: true, force: true });
});

test('a slice still preparing at the deadline keeps its provider job for the next invocation', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-sl-'));
  const plan = slices.planSlices(1500, 30, 360);
  const env = fakeSliceEnv({ slowK: new Set([2]) });
  const r1 = await slices.fetchSlices({ videoUrl: 'u', ytId: 'abc', fmt: '240', plan, dir, deadline: Date.now() + 60000, minPullMs: 0, ...env });
  assert.deepEqual(r1.missing, [2]);
  const pk = slices.slicePendingKey('abc', '240', plan, 2);
  const kept = env.kv.get(pk);
  assert.ok(kept?.p, 'progress URL kept in KV');
  // Next invocation: the job finished meanwhile; it polls the SAME job (no new start) and gets the rest from Blob.
  const env2 = fakeSliceEnv({ saved: Object.fromEntries(env.kv) });
  const r2 = await slices.fetchSlices({ videoUrl: 'u', ytId: 'abc', fmt: '240', plan, dir, deadline: Date.now() + 60000, minPullMs: 0, ...env2 });
  assert.deepEqual(r2.missing, []);
  assert.equal(env2.calls.start.length, 0, 'no new provider jobs');
  assert.deepEqual(env2.calls.poll, [kept.p]);
  assert.equal(r2.stats.fromBlob, plan.slices.length - 1);
  assert.equal(r2.stats.resumed, 1);
  await fs.rm(dir, { recursive: true, force: true });
});

test('a provider slice job stuck for longer than the stale limit is restarted, not polled forever', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-sl-'));
  const plan = slices.planSlices(1500, 30, 360);
  const env = fakeSliceEnv();
  const stuck = 'https://p.example/progress?k=2&stuck=1&f=240&s=720&e=1140';
  env.kv.set(slices.slicePendingKey('abc', '240', plan, 2), { p: stuck, at: Date.now() - 20 * 60 * 1000 });
  const basePoll = env.poll;
  env.poll = async (p, t) => { if (p.includes('stuck=1')) { const e = new Error('download api timeout'); e.timeout = true; throw e; } return basePoll(p, t); };
  const r = await slices.fetchSlices({ videoUrl: 'u', ytId: 'abc', fmt: '240', plan, dir, deadline: Date.now() + 60000, minPullMs: 0, ...env });
  assert.deepEqual(r.missing, []);
  assert.equal(r.stats.restarted, 1);
  assert.equal(env.calls.start.length, plan.slices.length, 'one start per slice: 4 fresh + the restarted one is not double-counted');
  assert.ok(!env.calls.poll.includes(stuck), 'the stuck job is not polled');
  await fs.rm(dir, { recursive: true, force: true });
});

test('a recent pending job is still resumed (not restarted)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-sl-'));
  const plan = slices.planSlices(1500, 30, 360);
  const env = fakeSliceEnv();
  const recent = 'https://p.example/progress?k=2&f=240&s=720&e=1140';
  env.kv.set(slices.slicePendingKey('abc', '240', plan, 2), { p: recent, at: Date.now() - 60 * 1000 });
  const r = await slices.fetchSlices({ videoUrl: 'u', ytId: 'abc', fmt: '240', plan, dir, deadline: Date.now() + 60000, minPullMs: 0, ...env });
  assert.deepEqual(r.missing, []);
  assert.ok(!r.stats.restarted);
  assert.ok(env.calls.poll.includes(recent));
  await fs.rm(dir, { recursive: true, force: true });
});

test('last hop (deferBlob off): slices saved in Blob are read even when one slice is still missing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-sl-'));
  const plan = slices.planSlices(1500, 30, 360);
  const saved = {};
  plan.slices.forEach(sl => { if (sl.k !== 2) saved[slices.sliceKey('abc', '240', plan, sl.k)] = { blob: `https://blob.example/${sl.k}.mp4` }; });
  const env = fakeSliceEnv({ saved, slowK: new Set([2]) });
  const r = await slices.fetchSlices({ videoUrl: 'u', ytId: 'abc', fmt: '240', plan, dir, deadline: Date.now() + 60000, minPullMs: 0, deferBlob: false, ...env });
  assert.deepEqual(r.missing, [2]);
  assert.equal(r.files.size, plan.slices.length - 1, 'partial set is available to continue with');
  await fs.rm(dir, { recursive: true, force: true });
});

test('with too little time left, jobs are started (for the next invocation) but not awaited', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-sl-'));
  const plan = slices.planSlices(1500, 30, 360);
  const env = fakeSliceEnv();
  const r = await slices.fetchSlices({ videoUrl: 'u', ytId: 'abc', fmt: '240', plan, dir, deadline: Date.now() + 10000, minPullMs: 75000, ...env });
  assert.equal(env.calls.start.length, plan.slices.length);
  assert.equal(env.calls.poll.length, 0);
  assert.equal(r.missing.length, plan.slices.length);
  assert.ok(plan.slices.every(sl => env.kv.get(slices.slicePendingKey('abc', '240', plan, sl.k))?.p));
  await fs.rm(dir, { recursive: true, force: true });
});

test('slice audio is continuous in source time and clips cut from slices match the source', { skip: !ffmpegPath() }, async () => {
  const ff = ffmpegPath();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-sla-'));
  const src = path.join(dir, 'src.mp4');
  // 100s source with keyframes every 137 frames (not aligned with slice starts), like YouTube.
  execFileSync(ff, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30000/1001', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
    '-t', '100', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '137', '-keyint_min', '137', '-sc_threshold', '0', '-c:a', 'aac', '-b:a', '48k', '-shortest', src]);
  const plan = slices.planSlices(100, 10, 30);
  // Hand-built small plan (real plans use >= 60s overlap) so the 100s source has 3 slices.
  const small = { dur: 100, S: 30, ov: 15, slices: [{ k: 0, start: 0, end: 45 }, { k: 1, start: 30, end: 75 }, { k: 2, start: 60, end: 100 }] };
  assert.ok(plan.slices.length >= 1);
  const files = new Map();
  for (const s of small.slices) {
    const f = path.join(dir, `slice_${s.k}.mp4`);
    // Same cut the provider makes: input seek + stream copy (snaps back to a keyframe, edit list).
    execFileSync(ff, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(s.start), '-to', String(s.end), '-i', src, '-c', 'copy', f]);
    files.set(s.k, f);
  }
  const audio = await slices.buildSliceAudio(small, files, path.join(dir, 'audio.mp3'));
  const { probeDuration } = await import('../lib/localprep.js');
  const d = await probeDuration(audio);
  assert.ok(Math.abs(d - 100) < 0.6, `audio duration ${d}`);
  // A frame at absolute time t taken from the right slice equals the source frame (within one frame of seek rounding).
  const frame = (file, t) => execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']).toString('base64');
  for (const t of [5, 33.3, 52, 71.5, 90]) {
    const sl = slices.sliceFor(small.slices, t, 3);
    const got = frame(files.get(sl.k), sl.rel);
    const near = [-1, 0, 1].map(d => frame(src, Math.max(0, t + d * 1001 / 30000)));
    assert.ok(near.includes(got), `frame at ${t}s`);
  }
  await fs.rm(dir, { recursive: true, force: true });
});

function hqEnv({ ready = {}, fail = new Set(), delay = {} } = {}) {
  const calls = { start: [], poll: [], download: [] };
  return {
    calls,
    start: async ({ startTime, endTime, format }) => { calls.start.push({ startTime, endTime, format }); return `https://p.example/${format}?s=${startTime}&e=${endTime}`; },
    poll: async (p, timeoutMs) => {
      calls.poll.push(p);
      const f = new URL(p).pathname.slice(1);
      if (fail.has(f)) { const e = new Error('no such format'); e.failed = true; throw e; }
      const d = delay[f] ?? 0;
      if (d > timeoutMs || ready[f] === false) { await new Promise(r => setTimeout(r, Math.min(timeoutMs, 30))); const e = new Error('download api timeout'); e.timeout = true; throw e; }
      await new Promise(r => setTimeout(r, d));
      return `https://cdn.example/${f}.mp4`;
    },
    download: async (u, file) => { calls.download.push(u); await fs.writeFile(file, bytes(3000)); return { size: 3000 }; },
  };
}

test('startHqJobs starts 1080p and 720p jobs for the padded clip window', async () => {
  const env = hqEnv();
  const hq = await slices.startHqJobs({ start: env.start, clipStart: 125.4, len: 30, dur: 4000 });
  assert.equal(hq.s0, 123);
  assert.equal(hq.e0, 158);
  assert.deepEqual(env.calls.start.map(c => c.format).sort(), ['1080', '720']);
  assert.ok(hq.jobs['1080'] && hq.jobs['720']);
});

test('fetchHqClip prefers 1080p and returns the clip offset inside the cut', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-hq-'));
  const env = hqEnv({ delay: { '720': 5, '1080': 40 } });
  const hq = await slices.startHqJobs({ start: env.start, clipStart: 125.4, len: 30, dur: 4000 });
  const r = await slices.fetchHqClip({ hq, clipStart: 125.4, len: 30, dir, tag: 't', deadline: Date.now() + 60000, poll: env.poll, start: env.start, download: env.download, preferWaitMs: 2000 });
  assert.equal(r.fmt, '1080');
  assert.ok(Math.abs(r.rel - 2.4) < 1e-9);
  assert.deepEqual(env.calls.download, ['https://cdn.example/1080.mp4']);
  await fs.rm(dir, { recursive: true, force: true });
});

test('fetchHqClip takes 720p when the video has no 1080p', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-hq-'));
  const env = hqEnv({ fail: new Set(['1080']) });
  const hq = await slices.startHqJobs({ start: env.start, clipStart: 10, len: 30, dur: 600 });
  const r = await slices.fetchHqClip({ hq, clipStart: 10, len: 30, dir, tag: 't', deadline: Date.now() + 60000, poll: env.poll, start: env.start, download: env.download, preferWaitMs: 50 });
  assert.equal(r.fmt, '720');
  await fs.rm(dir, { recursive: true, force: true });
});

test('fetchHqClip reports .timeout (hand off and keep polling) while jobs are still preparing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-hq-'));
  const env = hqEnv({ ready: { '1080': false, '720': false } });
  const hq = await slices.startHqJobs({ start: env.start, clipStart: 10, len: 30, dur: 600 });
  await assert.rejects(slices.fetchHqClip({ hq, clipStart: 10, len: 30, dir, tag: 't', deadline: Date.now() + 9500, poll: env.poll, start: env.start, download: env.download }), (e) => e.timeout === true && !e.failed);
  // The next invocation polls the very same jobs (no new starts) and gets the cut.
  const env2 = hqEnv();
  const r = await slices.fetchHqClip({ hq, clipStart: 10, len: 30, dir, tag: 't', deadline: Date.now() + 60000, poll: env2.poll, start: env2.start, download: env2.download, preferWaitMs: 50 });
  assert.equal(r.fmt, '1080');
  assert.equal(env2.calls.start.length, 0);
  assert.deepEqual(env2.calls.poll.sort(), [hq.jobs['1080'], hq.jobs['720']].sort());
  await fs.rm(dir, { recursive: true, force: true });
});

test('fetchHqClip falls back to one 480p job only when every HQ job failed', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-hq-'));
  const env = hqEnv({ fail: new Set(['1080', '720']) });
  const hq = await slices.startHqJobs({ start: env.start, clipStart: 10, len: 30, dur: 600 });
  const r = await slices.fetchHqClip({ hq, clipStart: 10, len: 30, dir, tag: 't', deadline: Date.now() + 60000, poll: env.poll, start: env.start, download: env.download });
  assert.equal(r.fmt, '480');
  assert.ok(hq.jobs['480'], 'the 480p job is kept with the clip for later hops');
  await fs.rm(dir, { recursive: true, force: true });
});

test('downloadViaRapid sends start_time/end_time for cut downloads', async () => {
  process.env.YT_RAPIDAPI_KEY = process.env.YT_RAPIDAPI_KEY || 'test-rapid-key';
  const mod = await import('../lib/downloader.js?rapid=' + Date.now());
  const orig = globalThis.fetch;
  let first;
  globalThis.fetch = async (u) => {
    if (!first) { first = String(u); return jsonResponse(200, { success: true, progress_url: 'https://p.example/progress?id=1' }); }
    return jsonResponse(200, { success: 1, progress: 1000, download_url: 'https://cdn.example/cut.mp4' });
  };
  try {
    const u = await mod.downloadViaRapid('https://www.youtube.com/watch?v=abc', 20000, { format: '240', startTime: 360.7, endTime: 780.2 });
    assert.equal(u, 'https://cdn.example/cut.mp4');
    const q = new URL(first).searchParams;
    assert.equal(q.get('format'), '240');
    assert.equal(q.get('start_time'), '360');
    assert.equal(q.get('end_time'), '781');
  } finally { globalThis.fetch = orig; }
});

// ---- Fast Origin Transfer / disk fixes ----
test('saved slices are not read from Blob while provider slices are still missing (no wasted re-reads before a hand-off)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-sl-'));
  const plan = slices.planSlices(1500, 30, 360);
  const saved = { [slices.sliceKey('abc', '240', plan, 0)]: { blob: 'https://blob.example/s0' }, [slices.sliceKey('abc', '240', plan, 1)]: { blob: 'https://blob.example/s1' } };
  const env = fakeSliceEnv({ saved, slowK: new Set([3]) });
  const r = await slices.fetchSlices({ videoUrl: 'u', ytId: 'abc', fmt: '240', plan, dir, deadline: Date.now() + 60000, minPullMs: 0, ...env });
  assert.deepEqual(r.missing, [3], 'only the truly missing slice is reported');
  assert.equal(r.stats.fromBlob, 0);
  assert.equal(r.stats.deferred, 2);
  assert.ok(!env.calls.download.some(u => u.startsWith('https://blob.example/')), 'no Blob reads');
  await fs.rm(dir, { recursive: true, force: true });
});

test('saved slices are read once every provider slice is in', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-sl-'));
  const plan = slices.planSlices(1500, 30, 360);
  const saved = { [slices.sliceKey('abc', '240', plan, 0)]: { blob: 'https://blob.example/s0' } };
  const env = fakeSliceEnv({ saved });
  const r = await slices.fetchSlices({ videoUrl: 'u', ytId: 'abc', fmt: '240', plan, dir, deadline: Date.now() + 60000, minPullMs: 0, ...env });
  assert.deepEqual(r.missing, []);
  assert.equal(r.files.size, plan.slices.length);
  assert.equal(r.stats.fromBlob, 1);
  assert.equal(env.calls.download.at(-1), 'https://blob.example/s0', 'Blob read last');
  await fs.rm(dir, { recursive: true, force: true });
});

const canUseDevFull = process.platform === 'linux' && process.getuid?.() !== 0 && await fs.access('/dev/full').then(() => true, () => false);
test('a full /tmp (ENOSPC) fails fast as tooBig/noSpace instead of retrying', { skip: !canUseDevFull }, async () => {
  const lp = await import('../lib/localprep.js');
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(streamChunks([bytes(70000), bytes(70000)])); };
  try {
    // Every write to /dev/full fails with a real ENOSPC.
    const err = await lp.downloadToFile('https://cdn.example/v.mp4', '/dev/full', 10000).then(() => null, e => e);
    assert.ok(err, 'download must fail');
    assert.equal(err.noSpace, true);
    assert.equal(err.tooBig, true, 'callers treat it like an oversize source (lighter tier / no retry)');
    assert.equal(calls, 1, 'no retries into a full disk');
  } finally { globalThis.fetch = realFetch; }
  assert.ok(lp.isNoSpace(new Error('x', { cause: { code: 'ENOSPC' } })));
  assert.ok(!lp.isNoSpace(new Error('source fetch 500')));
});

test('tmp sweep removes only work dirs older than any live invocation', async () => {
  const lp = await import('../lib/localprep.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-sweep-'));
  const old = path.join(root, 'clip-old'); const fresh = path.join(root, 'clip-new'); const other = path.join(root, 'keep-me');
  for (const d of [old, fresh, other]) await fs.mkdir(d);
  await fs.writeFile(path.join(old, 'src.mp4'), bytes(1000));
  const past = new Date(Date.now() - 10 * 60 * 1000);
  await fs.utimes(old, past, past); await fs.utimes(other, past, past);
  const r = await lp.sweepStaleTmp({ dir: root, force: true });
  assert.equal(r.removed, 1);
  assert.deepEqual((await fs.readdir(root)).sort(), ['clip-new', 'keep-me']);
  await fs.rm(root, { recursive: true, force: true });
});

test('tmp budget splits free space between live jobs and never exceeds the max', async () => {
  const lp = await import('../lib/localprep.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vac-bud-'));
  const own = path.join(root, 'clip-a'); await fs.mkdir(own); await fs.mkdir(path.join(root, 'clip-b'));
  const statfs = async () => ({ bavail: 448e6 / 4096, bsize: 4096 }); // 448 MB free
  const cap = await lp.tmpBudget(own, 420e6, { dir: root, statfs });
  assert.equal(cap, Math.floor((448e6 - 48e6) / 2)); // 2 jobs share 400 MB
  assert.equal(await lp.tmpBudget(own, 100e6, { dir: root, statfs }), 100e6);
  assert.equal(await lp.tmpBudget(own, 420e6, { dir: root, statfs: async () => { throw new Error('no statfs'); } }), 420e6);
  await fs.rm(root, { recursive: true, force: true });
});

test('toRenderUrl: non-Blob and public Blob URLs pass through; a presign failure falls back to the signed /api/media proxy', async () => {
  const m = await import('../lib/media.js');
  assert.equal(await m.toRenderUrl('https://cdn.example/v.mp4'), 'https://cdn.example/v.mp4');
  const pub = 'https://abc.public.blob.vercel-storage.com/clips/x.mp4';
  assert.equal(await m.toRenderUrl(pub), pub);
  const priv = 'https://abc.private.blob.vercel-storage.com/segments/1_0-RAND.mp4';
  const saved = process.env.BLOB_READ_WRITE_TOKEN; delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
  try {
    const u = await m.toRenderUrl(priv);
    assert.match(u, /^https:\/\/viralaiclipper\.com\/api\/media\?u=/);
    const q = new URL(u).searchParams;
    assert.ok(m.verifyMedia(q.get('u'), q.get('x'), q.get('s')));
  } finally { if (saved) process.env.BLOB_READ_WRITE_TOKEN = saved; }
});
