// Failed-generation hardening (Nov 22): length lookup, honest too-long errors, Gemini
// parsing, slice length refusals, hand-off kicks, and error classification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { db } from './fake-kv.mjs';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-1234567890';
process.env.YT_RAPIDAPI_KEY = process.env.YT_RAPIDAPI_KEY || 'test-rapid-not-real';

const { parseScoreJson } = await import('../lib/scoreparse.js');
const { classifyGenError, issueFromLinkMeta, isBlockingIssue, ytTooLongMessage } = await import('../lib/pipeline.js');
const { resolveYoutubeSecs, lengthFromPlayer } = await import('../lib/ytinfo.js');
const { isDurationLimitError, ytSourceMaxSec, startRapidJob, pollRapidJob, EXTENDED_MAX_MIN } = await import('../lib/downloader.js');
const { fetchSlices, planSlices, isLengthRefusal } = await import('../lib/slices.js');
const { kickContinue, claimKick, readJob, createJob, touchJob } = await import('../lib/jobs.js');
const { buildYtDlpArgs } = await import('../lib/ytproxy.js');

test('Gemini scores parse from {clips}, a bare array, and fenced JSON', () => {
  const clip = { title: 'A', startSec: 12, score: 80 };
  assert.equal(parseScoreJson(JSON.stringify({ clips: [clip] })).clips.length, 1);
  assert.deepEqual(parseScoreJson(JSON.stringify([clip, clip])).clips.length, 2); // the production failure
  assert.equal(parseScoreJson('```json\n' + JSON.stringify([clip]) + '\n```').clips[0].startSec, 12);
  assert.equal(parseScoreJson('Here you go: ' + JSON.stringify({ moments: [clip] })).clips.length, 1);
  assert.equal(parseScoreJson('not json'), null);
});

test('user-side limits are classified as blocked, real failures as errors', () => {
  const user = [
    [{ message: "You've used your 3 free generations today. Upgrade to Pro or buy credits to keep going." }, 'daily_limit'],
    [{ message: 'Too many requests. Wait a minute and try again.' }, 'rate_limited'],
    [{ message: "That doesn't look like a public video link. Paste a YouTube (or other public video) URL." }, 'bad_link'],
    [{ message: ytTooLongMessage(15000) }, 'too_long'],
    [{ message: 'x', code: 'too_long' }, 'too_long'],
    [{ message: 'That YouTube video is unavailable (private, removed, or region-locked). Try another link.' }, 'unavailable_video'],
  ];
  for (const [e, reason] of user) assert.deepEqual(classifyGenError(e), { reason, user: true }, e.message);
  const sys = [
    [{ message: 'YouTube downloads are temporarily down on our side (YouTube is blocking our video downloader).', code: 'upload_fallback' }, 'download_blocked'],
    [{ message: 'No clips could be made from that video (renderio timeout).' }, 'render_failed'],
    [{ message: 'send is not defined' }, 'other'],
    [{ message: 'x', code: 'capacity' }, 'capacity'],
  ];
  for (const [e, reason] of sys) assert.deepEqual(classifyGenError(e), { reason, user: false }, e.message);
});

test('videos over the downloader length cap are blocked up front with a clear message', () => {
  const max = ytSourceMaxSec();
  assert.equal(max, 180 * 60, 'extended (paid) durations stay off by default');
  assert.equal(EXTENDED_MAX_MIN, 0);
  const issue = issueFromLinkMeta({ url: 'u', secs: 14990, hardMaxSecs: max, maxSecs: 7200 }, 'u');
  assert.equal(issue.code, 'too_long');
  assert.ok(isBlockingIssue(issue));
  assert.match(issue.message, /4h 10m long/);
  assert.match(issue.message, /up to 3 hours/);
  // Under the cap but over the processing window: still just a warning (first 2 hours).
  const warn = issueFromLinkMeta({ url: 'u', secs: 9000, hardMaxSecs: max, maxSecs: 7200 }, 'u');
  assert.equal(warn.code, 'windowed');
  assert.equal(isBlockingIssue(warn), false);
});

test('provider length refusals are recognized in every wording', () => {
  assert.ok(isDurationLimitError('This video exceeds the standard duration limit for this format. Use allow_extended_duration=1 parameter.'));
  assert.ok(isDurationLimitError('This video exceeds the standard duration limit for this format. Extended duration permission required.'));
  assert.ok(isLengthRefusal(new Error('This video exceeds the standard duration limit for this format. Use allow_extended_duration=1 parameter.')));
  assert.equal(isDurationLimitError('download api timeout'), false);
});

test('InnerTube player replies give length even when the video is unplayable here', () => {
  assert.deepEqual(lengthFromPlayer({ playabilityStatus: { status: 'UNPLAYABLE' }, videoDetails: { lengthSeconds: '14990', isLiveContent: true } }), { secs: 14990 });
  assert.deepEqual(lengthFromPlayer({ videoDetails: { isLive: true, lengthSeconds: '0' } }), { secs: -1 });
  assert.deepEqual(lengthFromPlayer({ videoDetails: { isUpcoming: true } }), { secs: -2 });
  assert.equal(lengthFromPlayer({ playabilityStatus: { status: 'LOGIN_REQUIRED' } }), null);
});

test('resolveYoutubeSecs falls through page -> player -> info -> proxy and caches', async () => {
  const kv = new Map();
  const deps = { kvGet: async (k) => kv.get(k) ?? null, kvSet: async (k, v) => { kv.set(k, v); } };
  // Page and provider info blind (datacenter IP), player answers.
  let r = await resolveYoutubeSecs('vid1', null, { deps: { ...deps, page: async () => null, info: async () => null, player: async (id, f) => (f === fetch ? 14990 : null) } });
  assert.equal(r, 14990);
  assert.equal(kv.get('ytlen1:vid1').secs, 14990);
  // Cached now: no lookups at all.
  r = await resolveYoutubeSecs('vid1', null, { deps: { ...deps, page: async () => { throw new Error('should not run'); }, info: async () => null, player: async () => null } });
  assert.equal(r, 14990);
  // Everything direct is blind; the proxied player call finds it.
  let proxied = 0;
  const pf = async () => new Response('{}');
  r = await resolveYoutubeSecs('vid2', null, { deps: { ...deps, proxyFetchFn: pf, page: async () => null, info: async () => null, player: async (id, f) => { if (f === pf) { proxied++; return 5704; } return null; } } });
  assert.equal(r, 5704);
  assert.equal(proxied, 1);
  // Live / upcoming / removed pass through untouched and aren't cached.
  assert.equal(await resolveYoutubeSecs('vid3', null, { deps: { ...deps, page: async () => -1, info: async () => null, player: async () => null } }), -1);
  assert.equal(await resolveYoutubeSecs('vid4', null, { proxy: false, deps: { ...deps, page: async () => 0, info: async () => null, player: async () => null } }), 0);
  assert.equal(await resolveYoutubeSecs('vid5', null, { proxy: false, deps: { ...deps, page: async () => null, info: async () => null, player: async () => null } }), null);
});

test('extended-duration billing params are never sent unless explicitly enabled', async () => {
  const orig = globalThis.fetch;
  let seen = '';
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://fake-kv.test')) return orig(u, init);
    seen = String(u);
    return new Response(JSON.stringify({ success: true, progress_url: 'https://p.test/progress?id=1' }), { status: 200 });
  };
  try {
    await startRapidJob('https://www.youtube.com/watch?v=abc', { startTime: 0, endTime: 420, format: '240' });
    assert.ok(seen.includes('start_time=0'));
    assert.ok(!seen.includes('allow_extended_duration'), 'paid multiplier must stay off');
  } finally { globalThis.fetch = orig; }
});

test('slice progress failures for length are tagged so callers stop instead of hopping', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://fake-kv.test')) return orig(u, init);
    return new Response(JSON.stringify({ success: 0, progress: 1000, text: 'This video exceeds the standard duration limit for this format. Use allow_extended_duration=1 parameter.' }), { status: 200 });
  };
  try {
    await assert.rejects(() => pollRapidJob('https://p.test/progress?id=1', 3000, 10), (e) => e.failed && e.durationLimit);
  } finally { globalThis.fetch = orig; }

  const plan = planSlices(4 * 3600, 30, undefined, { maxSec: 7200, maxSlices: 20 });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'res-'));
  let starts = 0;
  const lengthErr = () => { const e = new Error('This video exceeds the standard duration limit for this format. Use allow_extended_duration=1 parameter.'); e.failed = true; e.durationLimit = true; return e; };
  const got = await fetchSlices({ videoUrl: 'https://youtu.be/x', ytId: 'lenref', fmt: '240', plan, dir, deadline: Date.now() + 20000,
    start: async () => { starts++; return 'https://p.test/progress?id=' + starts; },
    poll: async () => { throw lengthErr(); },
    kvGet: async () => null, kvSet: async () => {}, minPullMs: 0, conc: 4 });
  assert.equal(got.stats.durationLimit, true);
  assert.equal(got.files.size, 0);
  assert.equal(got.stats.pending, 0, 'nothing left in flight, so no hand-off');
  assert.ok(starts <= plan.slices.length + 4, `no retry storm (starts=${starts})`);
  await fs.rm(dir, { recursive: true, force: true });
});

test('a hand-off the server could not start is kicked once from a browser poll', async () => {
  const id = 'kickjob' + Date.now().toString(36);
  await createJob(id, { slotKey: null, tier: 'free', payload: { videoUrl: 'https://youtu.be/abc' } });
  await touchJob(id, { continued: false, hops: 5, kick: Date.now() });
  let j = await readJob(id, 0);
  assert.equal(j.kick, true);
  assert.equal(await claimKick(id), true);
  assert.equal(await claimKick(id), false, 'only one poll may kick');
  const calls = [];
  const ok = await kickContinue(id, 'https://viralaiclipper.test', { videoUrl: 'https://youtu.be/abc' }, async (u, init) => { calls.push({ u, h: init.headers }); return new Response(null, { status: 200 }); });
  assert.equal(ok, true);
  assert.equal(calls[0].u, 'https://viralaiclipper.test/api/generate');
  assert.equal(calls[0].h['x-continue-job'], id);
  assert.ok(calls[0].h['x-continue-sig'].length === 64);
  // A 204 means the continuation was already claimed elsewhere: not "resumed" by us.
  assert.equal(await kickContinue(id, 'https://x.test', {}, async () => new Response(null, { status: 204 })), false);
  await touchJob(id, { continued: true });
  j = await readJob(id, 0);
  assert.equal(j.kick, false, 'claimed continuation clears the kick');
});

test('proxied yt-dlp for other sites is size-capped', () => {
  const args = buildYtDlpArgs({ outFile: '/tmp/x.mp4', videoUrl: 'https://www.tiktok.com/@a/video/1', proxyUrl: 'http://u:p@proxy.test:10001', maxFilesizeMb: 150 });
  const i = args.indexOf('--max-filesize');
  assert.ok(i > 0);
  assert.equal(args[i + 1], '150M');
  assert.equal(buildYtDlpArgs({ outFile: '/tmp/x.mp4', videoUrl: 'https://youtu.be/a' }).includes('--max-filesize'), false);
});

test('paid YouTube window never promises more than the downloader cap', async () => {
  const { ytPaidWindowSec, PAID_PROCESS_SEC } = await import('../lib/pipeline.js');
  assert.equal(ytPaidWindowSec(ytSourceMaxSec()), Math.min(PAID_PROCESS_SEC, 10800));
  assert.equal(ytPaidWindowSec(10800), 10800, 'default: 3 hours, not 4');
  assert.equal(ytPaidWindowSec(0), 10800, 'unknown cap falls back to 3 hours');
  assert.equal(ytPaidWindowSec(360 * 60), PAID_PROCESS_SEC, 'extended cap allows the full paid window');
});

test('video-only live windows: transcript skips cleanly, segments get a silent audio track', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);
  const { hasAudioStream, extractWholeAudio, segmentArgs } = await import('../lib/localprep.js');
  const { default: ffmpegStatic } = await import('ffmpeg-static');
  const ffmpegBin = () => ffmpegStatic;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'noaud-'));
  const src = path.join(dir, 'window.mp4');
  await exec(ffmpegBin(), ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25', '-t', '6', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '25', '-pix_fmt', 'yuv420p', src]);
  assert.equal(await hasAudioStream(src), false);
  await assert.rejects(() => extractWholeAudio(src, path.join(dir, 'audio-full')), (e) => e.code === 'no_audio');
  for (const reencode of [false, true]) {
    const out = path.join(dir, `seg_${reencode}.mp4`);
    await exec(ffmpegBin(), segmentArgs(src, out, 1, '3.5', { silent: true, reencode }));
    const probe = await exec(ffmpegBin(), ['-hide_banner', '-i', out]).catch(e => e);
    assert.match(String(probe.stderr), /Audio: aac/, `silent track added (reencode=${reencode})`);
    const m = String(probe.stderr).match(/Duration: (\d+):(\d+):([\d.]+)/);
    const secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    assert.ok(secs > 2.5 && secs < 4.6, `segment length bounded (${secs})`);
  }
  // Sources with audio keep the plain stream-copy path.
  const withAud = path.join(dir, 'aud.mp4');
  await exec(ffmpegBin(), ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', withAud]);
  assert.equal(await hasAudioStream(withAud), true);
  assert.ok(segmentArgs(withAud, 'o.mp4', 0, '2', {}).includes('0:a:0?'));
  assert.ok(!segmentArgs(withAud, 'o.mp4', 0, '2', {}).includes('anullsrc=r=48000:cl=stereo'));
  await fs.rm(dir, { recursive: true, force: true });
});
