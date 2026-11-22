import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';

const {
  isValidAudioBuffer, audioFormMeta, isGroqQuotaError, extractWholeAudio,
  localTranscript, clipAudio, localFfmpegAvailable,
} = await import('../lib/localprep.js');

const exec = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH || ['/usr/bin/ffmpeg', 'ffmpeg'].find(p => existsSync(p) || p === 'ffmpeg') || 'ffmpeg';

test('isValidAudioBuffer accepts mp3, m4a and wav magic, rejects junk', () => {
  const id3 = Buffer.concat([Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00'), Buffer.alloc(300, 0xFF)]);
  // MPEG-1 Layer III sync
  const mpeg = Buffer.concat([Buffer.from([0xFF, 0xFB, 0x90, 0x00]), Buffer.alloc(300, 0)]);
  const m4a = Buffer.concat([Buffer.from('\x00\x00\x00\x20ftypM4A '), Buffer.alloc(300, 0)]);
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(300, 0)]);
  assert.equal(isValidAudioBuffer(id3), true);
  assert.equal(isValidAudioBuffer(mpeg), true);
  assert.equal(isValidAudioBuffer(m4a), true);
  assert.equal(isValidAudioBuffer(wav), true);
  assert.equal(isValidAudioBuffer(Buffer.from('not audio')), false);
  assert.equal(isValidAudioBuffer(Buffer.alloc(10)), false);
  assert.equal(audioFormMeta(m4a).type, 'audio/mp4');
  assert.equal(audioFormMeta(id3).type, 'audio/mpeg');
  assert.equal(audioFormMeta(wav).type, 'audio/wav');
});

test('isGroqQuotaError treats 429 ASPD as quota and not a 400', () => {
  assert.equal(isGroqQuotaError({ status: 429, detail: 'seconds of audio per day (ASPD): Limit 28800' }), true);
  assert.equal(isGroqQuotaError({ status: 400, detail: 'invalid_media_file' }), false);
  assert.equal(isGroqQuotaError({ segments: [{ start: 0, end: 1, text: 'hi' }] }), false);
});

async function makeToneMp4(dir, sec = 2) {
  const file = path.join(dir, 'tone.mp4');
  await exec(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `testsrc=duration=${sec}:size=320x240:rate=15`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${sec}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    '-movflags', '+faststart', file]);
  return file;
}

// Same shape as a live window: MPEG-TS remuxed with -c copy into an mp4.
async function makeRemuxedLiveLike(dir, sec = 3) {
  const src = await makeToneMp4(dir, sec);
  const ts = path.join(dir, 'live.ts');
  const mp4 = path.join(dir, 'live-window.mp4');
  await exec(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-c', 'copy', '-f', 'mpegts', ts]);
  await exec(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', ts, '-c', 'copy', '-movflags', '+faststart', mp4]);
  return mp4;
}

const haveFfmpeg = localFfmpegAvailable() || existsSync('/usr/bin/ffmpeg');
if (haveFfmpeg && !process.env.FFMPEG_PATH && existsSync('/usr/bin/ffmpeg')) process.env.FFMPEG_PATH = '/usr/bin/ffmpeg';

test('extractWholeAudio from a live-like remux yields a valid mp3 Groq would accept', { skip: !haveFfmpeg }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aud-'));
  const src = await makeRemuxedLiveLike(dir, 2);
  const { file, buf } = await extractWholeAudio(src, path.join(dir, 'audio-full'));
  assert.equal(isValidAudioBuffer(buf), true);
  assert.equal(audioFormMeta(buf).name, 'audio.mp3');
  assert.ok(buf.length > 500, 'mp3 should have a real body, not just a header');
  assert.ok(file.endsWith('.mp3'));
  const clip = await clipAudio(src, dir, 0.2, 1, 'x');
  assert.equal(isValidAudioBuffer(clip), true);
});

test('localTranscript on 429 calls Groq once then Gemini, never a second Groq attempt', { skip: !haveFfmpeg }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tr2-'));
  const src = await makeToneMp4(dir, 2);
  const groqCalls = [];
  const geminiCalls = [];
  const out = await localTranscript(src, dir, async (buf) => {
    groqCalls.push(buf.length);
    return { text: '', segments: [], status: 429, detail: 'seconds of audio per day (ASPD): Limit 28800' };
  }, {
    chunkSec: 600,
    fallback: async (buf) => {
      geminiCalls.push(buf.length);
      return { text: 'hello there', segments: [{ start: 0, end: 1.2, text: 'hello there' }] };
    },
  });
  assert.equal(groqCalls.length, 1);
  assert.equal(geminiCalls.length, 1);
  assert.equal(out.segments.length, 1);
  assert.equal(out.segments[0].text, 'hello there');
  assert.ok(isValidAudioBuffer ? true : true);
});

test('localTranscript does not retry Groq on 400 invalid_media_file', { skip: !haveFfmpeg }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tr3-'));
  const src = await makeToneMp4(dir, 2);
  const groqCalls = [];
  const out = await localTranscript(src, dir, async () => {
    groqCalls.push(1);
    return { text: '', segments: [], status: 400, detail: 'invalid_media_file' };
  }, {
    fallback: async () => ({ text: 'ok', segments: [{ start: 0, end: 1, text: 'ok' }] }),
  });
  assert.equal(groqCalls.length, 1);
  assert.equal(out.segments[0].text, 'ok');
});
