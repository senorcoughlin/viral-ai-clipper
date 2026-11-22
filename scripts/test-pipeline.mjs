import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueFromLinkMeta, isBlockingIssue, fmtLen, processWindowSec, sliceCapFor, uploadFallbackMessage, FREE_PROCESS_SEC, PAID_PROCESS_SEC } from '../lib/pipeline.js';
import { planSlices, sliceOverlap, shouldSlice } from '../lib/slices.js';

test('fmtLen covers minutes and hours', () => {
  assert.equal(fmtLen(45), '45 seconds');
  assert.equal(fmtLen(90 * 60), '90 minutes');
  assert.equal(fmtLen(2 * 3600), '2 hours');
});

test('upcoming videos still block, live YouTube does not', () => {
  const live = issueFromLinkMeta({ url: 'https://youtu.be/abc', live: true, secs: 0 }, 'https://youtu.be/abc');
  assert.equal(live, null);
  const upcoming = issueFromLinkMeta({ url: 'https://youtu.be/abc', upcoming: true, secs: 0 }, 'https://youtu.be/abc');
  assert.equal(upcoming.code, 'upcoming');
  assert.equal(isBlockingIssue(upcoming), true);
});

test('over-length YouTube is windowed, not a hard block', () => {
  const issue = issueFromLinkMeta({ url: 'https://youtu.be/abc', secs: 5 * 3600, maxSecs: 2 * 3600 }, 'https://youtu.be/abc');
  assert.equal(issue.code, 'windowed');
  assert.equal(issue.warning, true);
  assert.equal(isBlockingIssue(issue), false);
  assert.match(issue.message, /first 2 hours/);
});

test('multi-day VODs are windowed (first N hours), not treated as live', () => {
  const issue = issueFromLinkMeta({ url: 'https://youtu.be/abc', secs: 30 * 3600, maxSecs: 7200 }, 'https://youtu.be/abc');
  assert.equal(issue.code, 'windowed');
  assert.equal(isBlockingIssue(issue), false);
});

test('process windows and slice caps stay within RenderIO-safe bounds', () => {
  assert.equal(processWindowSec('free'), FREE_PROCESS_SEC);
  assert.equal(processWindowSec('example'), FREE_PROCESS_SEC);
  assert.equal(processWindowSec('pro'), PAID_PROCESS_SEC);
  assert.equal(processWindowSec('credits'), PAID_PROCESS_SEC);
  assert.equal(sliceCapFor('free'), 20);
  assert.equal(sliceCapFor('pro'), 40);
  const free = planSlices(5 * 3600, 30, 360, { maxSec: processWindowSec('free'), maxSlices: sliceCapFor('free') });
  assert.equal(free.windowed, true);
  assert.ok(free.dur <= 2 * 3600);
  assert.ok(free.slices.length <= 20);
  const paid = planSlices(6 * 3600, 30, 360, { maxSec: processWindowSec('pro'), maxSlices: sliceCapFor('pro') });
  assert.ok(paid.slices.length <= 40);
  assert.ok(paid.dur <= 4 * 3600);
});

test('planSlices keeps overlap so a clip fits in one slice', () => {
  const plan = planSlices(40 * 60, 30);
  assert.ok(shouldSlice(40 * 60));
  assert.equal(plan.ov, sliceOverlap(30));
  for (const s of plan.slices) assert.ok((s.end - s.start) >= 30 + 5 || s.end === plan.dur || s.k === plan.slices.length - 1);
});

test('upload fallback copy always offers the MP4 path', () => {
  for (const kind of ['youtube', 'slow', 'facebook', 'generic']) {
    const msg = uploadFallbackMessage(kind);
    assert.match(msg, /upload/i);
    assert.match(msg, /not counted/i);
  }
});
