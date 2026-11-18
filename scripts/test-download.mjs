import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

process.env.YT_DOWNLOAD_API_KEY = process.env.YT_DOWNLOAD_API_KEY || 'test-key-not-real';

const { downloadToFile } = await import('../lib/localprep.js');
const { isInsufficientBalance, downloadViaApi, downloadApiDown, _resetDownloadApiDownForTests } = await import('../lib/downloader.js');

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
