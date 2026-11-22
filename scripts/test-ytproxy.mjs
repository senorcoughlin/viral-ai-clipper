import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from './fake-kv.mjs';

process.env.YT_PROXY_URL = 'http://alice:fake-pass@proxy.test:10001';
process.env.YT_PROXY_CYCLE_DAY = process.env.YT_PROXY_CYCLE_DAY || '22';

const {
  redactProxy, isYoutubeBlockError, isProxyBudgetError, rotateProxyUrl, stickyProxyUrl,
  sectionSpec, formatSelector, buildYtDlpArgs, ffmpegProxyArgs, trimLocally, proxyCycleId, getProxyUsage, proxyAllowed,
  recordProxyAttempt, recordProxySuccess, recordProxyBytes, proxyConfigured, pickLiveVariants, pickLiveFormatsFromYtDlp,
  downloadViaProxyFallback, PROXY_BUDGET_BYTES,
} = await import('../lib/ytproxy.js');
const { parseMediaPlaylist } = await import('../lib/stream.js');
const { looksLikeYoutubeLive, resolveYoutubeLive } = await import('../lib/ytlive.js');

const SAMPLE = 'http://alice:fake-pass@proxy.test:10001';

test('rotateProxyUrl stays in 10001-10010 and is sticky for one job', () => {
  const a = new URL(rotateProxyUrl(SAMPLE, 'job-alpha'));
  const b = new URL(rotateProxyUrl(SAMPLE, 'job-alpha'));
  const c = new URL(stickyProxyUrl('job-alpha'));
  assert.equal(a.port, b.port);
  assert.equal(a.port, c.port);
  assert.equal(a.hostname, 'proxy.test');
  assert.ok(Number(a.port) >= 10001 && Number(a.port) <= 10010);
  const ports = new Set(Array.from({ length: 40 }, (_, i) => new URL(rotateProxyUrl(SAMPLE, 'job-' + i)).port));
  assert.ok(ports.size > 1, 'different jobs should spread across sticky ports');
  // Never leak the password into host/port checks
  assert.equal(a.password, 'fake-pass');
});

test('redactProxy strips user, password and host', () => {
  const raw = 'failed CONNECT http://alice:fake-pass@proxy.test:10001 (fake-pass)';
  const out = redactProxy(raw, SAMPLE);
  assert.equal(out.includes('fake-pass'), false);
  assert.equal(out.includes('proxy.test'), false);
  assert.match(out, /\[proxy/);
});

test('isYoutubeBlockError catches sign-in, bot, 403 and 429', () => {
  assert.equal(isYoutubeBlockError('Sign in to confirm you’re not a bot'), true);
  assert.equal(isYoutubeBlockError('HTTP Error 403: Forbidden'), true);
  assert.equal(isYoutubeBlockError('HTTP Error 429: Too Many Requests'), true);
  assert.equal(isYoutubeBlockError('SOURCE_RATE_LIMITED'), true);
  assert.equal(isYoutubeBlockError('private video'), false);
});

test('formatSelector caps at 1080 and prefers AVC+AAC over itag-18 mp4', () => {
  assert.match(formatSelector(720), /height<=720/);
  assert.match(formatSelector(2160), /height<=1080/);
  assert.match(formatSelector(720), /^bv\*\[height<=720\]\[vcodec\^=avc1\]\+ba\[ext=m4a\]/);
  assert.ok(!formatSelector(720).startsWith('b[height<=720][ext=mp4]'), 'must not prefer progressive itag 18 first');
});

test('sectionSpec still formats a window; buildYtDlpArgs does not use --download-sections', () => {
  assert.equal(sectionSpec(0, 120), '*00:00:00-00:02:00');
  assert.equal(sectionSpec(0, 0), null);
  const args = buildYtDlpArgs({ outFile: '/tmp/x.mp4', videoUrl: 'https://youtu.be/abc', proxyUrl: SAMPLE, height: 720, ffmpeg: '/usr/bin/ffmpeg' });
  assert.ok(args.includes('--proxy'));
  assert.equal(args[args.indexOf('--proxy') + 1], SAMPLE);
  assert.equal(args.includes('--download-sections'), false);
  assert.equal(args.includes('--force-keyframes-at-cuts'), false);
  const ff = ffmpegProxyArgs(SAMPLE);
  assert.ok(args.includes('--downloader-args'));
  assert.ok(ff.some(a => a.includes('ffmpeg_i:-http_proxy') && a.includes(SAMPLE)));
  const joined = args.join(' ');
  assert.ok(joined.includes('ffmpeg_i:-http_proxy'));
  // A thrown error built from args would include the URL; redact still works.
  assert.equal(redactProxy(joined, SAMPLE).includes('fake-pass'), false);
});

test('proxy cycle starts on the 22nd in America/New_York', () => {
  // 2026-11-22 05:00 UTC = 00:00 ET
  assert.equal(proxyCycleId(new Date('2026-11-22T05:00:00Z')), '2026-11-22');
  assert.equal(proxyCycleId(new Date('2026-12-21T16:00:00Z')), '2026-11-22');
  assert.equal(proxyCycleId(new Date('2026-12-22T05:00:00Z')), '2026-12-22');
});

test('usage guard stops the proxy around 9 GB and counts attempts', async () => {
  assert.equal(proxyConfigured(), true);
  const before = await getProxyUsage();
  assert.equal(before.exhausted, false);
  await recordProxyAttempt();
  await recordProxySuccess(2.5e6);
  const mid = await getProxyUsage();
  assert.equal(mid.attempts, before.attempts + 1);
  assert.equal(mid.successes, before.successes + 1);
  assert.equal(mid.bytes, before.bytes + 2.5e6);
  const cycle = mid.cycle;
  db.set(`yt:proxy:${cycle}:bytes`, String(PROXY_BUDGET_BYTES));
  assert.equal(await proxyAllowed(), false);
  const cap = await getProxyUsage();
  assert.equal(cap.exhausted, true);
  // Reset so later tests can use the proxy
  db.set(`yt:proxy:${cycle}:bytes`, String(before.bytes + 2.5e6));
});

test('downloadViaProxyFallback refuses when the budget is exhausted', async () => {
  const cycle = proxyCycleId();
  const prev = db.get(`yt:proxy:${cycle}:bytes`);
  db.set(`yt:proxy:${cycle}:bytes`, String(PROXY_BUDGET_BYTES + 1));
  await assert.rejects(
    () => downloadViaProxyFallback('https://youtu.be/abc', { dir: '/tmp', run: async () => { throw new Error('should not run'); }, upload: async () => 'https://blob.test/x', ensure: async () => '/bin/true' }),
    (e) => isProxyBudgetError(e),
  );
  if (prev == null) db.delete(`yt:proxy:${cycle}:bytes`);
  else db.set(`yt:proxy:${cycle}:bytes`, prev);
});

test('downloadViaProxyFallback redacts credentials from yt-dlp errors', async () => {
  const cycle = proxyCycleId();
  const prev = db.get(`yt:proxy:${cycle}:bytes`);
  db.set(`yt:proxy:${cycle}:bytes`, '0');
  await assert.rejects(
    () => downloadViaProxyFallback('https://youtu.be/abc', {
      dir: '/tmp',
      ensure: async () => '/bin/true',
      upload: async () => 'https://blob.test/x',
      run: async () => { throw new Error('CONNECT failed via http://alice:fake-pass@proxy.test:10001'); },
    }),
    (e) => !String(e.message).includes('fake-pass') && !String(e.message).includes('proxy.test'),
  );
  if (prev == null) db.delete(`yt:proxy:${cycle}:bytes`);
  else db.set(`yt:proxy:${cycle}:bytes`, prev);
});

test('downloadViaProxyFallback downloads without sections and trims only when needed', async () => {
  const cycle = proxyCycleId();
  const prev = db.get(`yt:proxy:${cycle}:bytes`);
  db.set(`yt:proxy:${cycle}:bytes`, '0');
  const fs = await import('node:fs/promises');
  const dir = await fs.mkdtemp('/tmp/ytp-test-');
  let seen;
  const got = await downloadViaProxyFallback('https://youtu.be/abc', {
    dir,
    endSec: 7200,
    ensure: async () => '/bin/true',
    upload: async (file) => 'https://blob.test/' + file.split('/').pop(),
    run: async (_bin, args) => {
      seen = args;
      const out = args[args.indexOf('-o') + 1];
      await fs.writeFile(out, 'not-a-real-mp4-but-nonempty');
    },
  });
  assert.equal(seen.includes('--download-sections'), false);
  assert.ok(seen.includes('--downloader-args'));
  assert.ok(got.bytes > 0);
  assert.ok(got.url.startsWith('https://blob.test/'));
  if (prev == null) db.delete(`yt:proxy:${cycle}:bytes`);
  else db.set(`yt:proxy:${cycle}:bytes`, prev);
});

test('pickLiveVariants prefers 240-360p and audio_only', () => {
  const { videoUrl, audioUrl, height } = pickLiveVariants([
    { height: 720, url: 'v720', name: '720p', bw: 3e6 },
    { height: 240, url: 'v240', name: '240p', bw: 4e5 },
    { height: 144, url: 'v144', name: '144p', bw: 2e5 },
    { height: 0, url: 'audio', name: 'audio_only', bw: 1e5 },
  ]);
  assert.equal(height, 240);
  assert.equal(videoUrl, 'v240');
  assert.equal(audioUrl, 'audio');
});

test('parseMediaPlaylist keeps MAP headers and timed segments', () => {
  const text = [
    '#EXTM3U',
    '#EXT-X-TARGETDURATION:2',
    '#EXT-X-MAP:URI="init.mp4"',
    '#EXTINF:2.000,',
    'seg0.ts',
    '#EXTINF:2.000,',
    'seg1.ts',
  ].join('\n');
  const segs = parseMediaPlaylist(text, 'https://ex.test/pl.m3u8');
  assert.equal(segs.length, 2);
  assert.equal(segs[0].start, 0);
  assert.equal(segs[1].start, 2);
  assert.match(segs[0].url, /seg0\.ts$/);
  assert.match(segs.header[0], /init\.mp4/);
});

test('looksLikeYoutubeLive treats -1 and 24/7 restreams as live', () => {
  assert.equal(looksLikeYoutubeLive(-1), true);
  assert.equal(looksLikeYoutubeLive(0, { live: true }), true);
  assert.equal(looksLikeYoutubeLive(13 * 3600), true);
  assert.equal(looksLikeYoutubeLive(600), false);
});

const noHlsFetch = async (url) => {
  if (String(url).includes('youtube.com/watch')) return new Response('<html>no player</html>', { status: 200 });
  if (String(url).includes('youtubei/v1/player')) return new Response('{}', { status: 200 });
  return new Response('no', { status: 404 });
};

const MASTER = ['#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=426x240,VIDEO="240p"',
  'https://ex.test/240.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,VIDEO="720p"',
  'https://ex.test/720.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=128000,VIDEO="audio_only"',
  'https://ex.test/audio.m3u8',
].join('\n');
const MEDIA = ['#EXTM3U', '#EXT-X-TARGETDURATION:5', '#EXTINF:5.0,', 'https://ex.test/s0.ts', '#EXTINF:5.0,', 'https://ex.test/s1.ts'].join('\n');

const proxyHlsFetch = async (url) => {
  const u = String(url);
  if (u.includes('youtube.com/watch')) {
    return new Response('<html>ytInitialPlayerResponse = {"streamingData":{"hlsManifestUrl":"https://ex.test/master.m3u8"},"videoDetails":{"title":"Live","author":"Ch"}}; var x=1;</html>', { status: 200 });
  }
  if (u.includes('master.m3u8')) return new Response(MASTER, { status: 200 });
  if (u.includes('240.m3u8') || u.includes('audio.m3u8')) return new Response(MEDIA, { status: 200 });
  return new Response('no', { status: 404 });
};

test('resolveYoutubeLive retries through the injected proxy fetch after a direct miss', async () => {
  const cycle = proxyCycleId();
  const prev = db.get(`yt:proxy:${cycle}:bytes`);
  db.set(`yt:proxy:${cycle}:bytes`, '0');
  try {
    await assert.rejects(
      () => resolveYoutubeLive('dQw4w9wgxcq', { proxySalt: 'test-live', fetchDirect: noHlsFetch, fetchProxy: noHlsFetch, probeJson: async () => null }),
      (e) => e.code === 'no_hls' && /upload a recording/i.test(e.message),
    );
    const media = await resolveYoutubeLive('dQw4w9wgxcq', { proxySalt: 'test-live', fetchDirect: noHlsFetch, fetchProxy: proxyHlsFetch });
    assert.equal(media.viaProxy, true);
    assert.equal(media.live, true);
    assert.equal(media.youtube, true);
    assert.equal(media.height, 240);
    assert.equal(media.videoUrl, 'https://ex.test/240.m3u8');
    assert.equal(media.audioUrl, 'https://ex.test/audio.m3u8');
    assert.equal(media.proxySalt, 'test-live');
    assert.ok(media.duration >= 10);
  } finally {
    if (prev == null) db.delete(`yt:proxy:${cycle}:bytes`);
    else db.set(`yt:proxy:${cycle}:bytes`, prev);
  }
});

test('proxy usage stats never include the proxy URL or password', async () => {
  const d = await getProxyUsage();
  assert.equal(typeof d.attempts, 'number');
  assert.equal(typeof d.successes, 'number');
  assert.equal(typeof d.mb, 'number');
  assert.equal(typeof d.configured, 'boolean');
  assert.equal(typeof d.cycle, 'string');
  const blob = JSON.stringify(d);
  assert.equal(blob.includes('fake-pass'), false);
  assert.equal(blob.includes('proxy.test'), false);
  assert.equal(blob.includes('YT_PROXY_URL'), false);
});

test('pickLiveFormatsFromYtDlp prefers 240p m3u8 plus audio', () => {
  const picked = pickLiveFormatsFromYtDlp({
    formats: [
      { format_id: '233', protocol: 'm3u8_native', vcodec: 'none', url: 'https://ex.test/a.m3u8' },
      { format_id: '269', protocol: 'm3u8_native', height: 144, url: 'https://ex.test/144.m3u8' },
      { format_id: '229', protocol: 'm3u8_native', height: 240, url: 'https://ex.test/240.m3u8' },
      { format_id: '232', protocol: 'm3u8_native', height: 720, url: 'https://ex.test/720.m3u8' },
    ],
  });
  assert.equal(picked.height, 240);
  assert.equal(picked.videoUrl, 'https://ex.test/240.m3u8');
  assert.equal(picked.audioUrl, 'https://ex.test/a.m3u8');
});
