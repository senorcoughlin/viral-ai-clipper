// Pro editing options: validation, filter building, and (when ffmpeg-static is present)
// a real ffmpeg run of the exact command renderioCut would send to RenderIO.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizePro, proAudio, wordFilters, renderioCut, PRO_GRADES } from '../lib/render.js';

const WORDS = [['this', 0.2, 0.5], ['is', 0.5, 0.7], ['the', 0.7, 0.9], ['very', 1.0, 1.3], ['first', 1.3, 1.7], ['video.', 1.7, 2.2], ['all', 2.5, 2.8], ['right', 2.8, 3.2]].map(([w, a, b]) => ({ w, a, b }));

test('sanitizePro keeps only whitelisted values', () => {
  assert.equal(sanitizePro(null), null);
  assert.equal(sanitizePro({ grade: 'evil;rm', speed: 9, capStyle: 'x' }), null);
  const p = sanitizePro({ grade: 'warm', speed: 1.25, loud: true, fade: true, capStyle: 'boxed', wordsPer: 1, accent: '#ff00aa', wmText: "@me'; drop", noWatermark: 'yes' });
  assert.deepEqual(p, { grade: 'warm', speed: 1.25, loud: true, fade: true, capStyle: 'boxed', wordsPer: 1, accent: '#ff00aa', wmText: '@me drop' });
});

test('proAudio builds speed/loudness/fade chain', () => {
  assert.equal(proAudio(null, 10), '');
  assert.equal(proAudio({ speed: 1.5, loud: true, fade: true }, 10), 'atempo=1.5,loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=in:d=0.3,afade=t=out:st=9.60:d=0.4');
});

test('wordFilters: 1 word at a time, boxed, accent on every other caption', () => {
  const f = wordFilters('', 4, WORDS, '', null, false, { wordsPer: 1, capStyle: 'boxed', accent: 'lime' });
  const parts = f.split(',drawtext').length;
  assert.equal(parts, WORDS.length);
  assert.match(f, /box=1/);
  assert.match(f, /fontcolor=0xC6FF3D/);
  const plain = wordFilters('', 4, WORDS, '', null, false, null);
  assert.ok(plain.split(',drawtext').length < WORDS.length);
  assert.doesNotMatch(plain, /box=1/);
});

async function captureCommand(opts, len = 3) {
  const orig = globalThis.fetch;
  let body = null;
  globalThis.fetch = async (u, init) => { body = JSON.parse(init.body); throw new Error('captured'); };
  try { await renderioCut('https://example.com/v.mp4', 0, len, 'k', '', true, { wordCaptions: true, timedWords: WORDS, direct: true, ...opts }); } catch {}
  finally { globalThis.fetch = orig; }
  return body;
}

test('renderioCut: free renders always keep the watermark, Pro can change it', async () => {
  const free = await captureCommand({ watermark: true, brand: { wm: { on: false } } });
  assert.match(free.ffmpeg_command, /viralaiclipper\.com/);
  const proNone = await captureCommand({ watermark: false, pro: { noWatermark: true } });
  assert.doesNotMatch(proNone.ffmpeg_command, /viralaiclipper\.com/);
  const proText = await captureCommand({ watermark: false, pro: { wmText: '@nathan' } });
  assert.match(proText.ffmpeg_command, /text='@nathan'/);
});

test('renderioCut: speed shortens the output and retimes captions', async () => {
  const b = await captureCommand({ watermark: false, pro: { speed: 1.5, grade: 'cinematic', loud: true, fade: true } }, 3);
  assert.match(b.ffmpeg_command, /-t 2\.000/);
  assert.match(b.ffmpeg_command, /setpts=PTS\/1\.5/);
  assert.match(b.ffmpeg_command, /-af "atempo=1\.5,loudnorm/);
  assert.ok(b.ffmpeg_command.includes(PRO_GRADES.cinematic));
});

// Run the real command through ffmpeg so a bad filter fails here, not on RenderIO.
// System ffmpeg (full build with drawtext, like RenderIO's); ffmpeg-static lacks drawtext.
const FF = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find(existsSync) || '';
test('ffmpeg accepts every Pro filter combination', { skip: !FF }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pro-'));
  // 6s 1280x720 test pattern with a tone, so both the video and audio chains are exercised.
  const SRC = join(dir, 'src.mp4');
  execFileSync(FF, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', SRC]);
  const combos = [
    { pro: { speed: 1.25, grade: 'warm', capStyle: 'boxed', accent: 'pink', loud: true, fade: true, wmText: '@me' } },
    { pro: { speed: 0.75, grade: 'bw', capStyle: 'shadow', wordsPer: 1, noWatermark: true }, keep: [[0, 1.2], [1.8, 3.5]] },
    { pro: { grade: 'vintage', capStyle: 'outline', fade: true }, bg: 'blur', progress: true, hook: 'Wait for it' },
    ...Object.keys(PRO_GRADES).map(g => ({ pro: { grade: g } })),
  ];
  for (const [i, c] of combos.entries()) {
    const len = c.keep ? 2.9 : 4;
    const b = await captureCommand({ watermark: false, ...c }, len);
    const out = join(dir, `o${i}.mp4`);
    const cmd = b.ffmpeg_command.replace('{{in_video}}', SRC).replace('{{out_clip}}', out);
    const args = cmd.match(/"[^"]*"|\S+/g).map(a => a.replace(/^"|"$/g, ''));
    execFileSync(FF, ['-y', '-loglevel', 'error', ...args], { stdio: 'pipe' });
    assert.ok(statSync(out).size > 1000, `combo ${i} produced a file`);
  }
});
