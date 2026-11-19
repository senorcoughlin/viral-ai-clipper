import { test } from 'node:test';
import assert from 'node:assert/strict';
const S = await import('../lib/spin.js');

test('spin odds: Pro is rarest, +20 clips second rarest, totals 100%', () => {
  const o = S.odds();
  const sum = o.reduce((t, x) => t + x.pct, 0);
  assert.ok(Math.abs(sum - 100) < 1e-9, String(sum));
  const sorted = [...S.PRIZES].sort((a, b) => a.weight - b.weight);
  assert.equal(sorted[0].id, 'pro');
  assert.equal(sorted[1].id, 'c20');
  assert.equal(o.find(x => x.id === 'pro').pct, 0.02);
  assert.equal(o.find(x => x.id === 'c20').pct, 0.1);
});

test('drawPrize maps the random ticket onto the right prize', () => {
  assert.equal(S.drawPrize(() => 0).id, 'c3');
  assert.equal(S.drawPrize(() => S.TOTAL - 1).id, 'pro');
  assert.equal(S.drawPrize(() => S.TOTAL - 21).id, 'c20');
  assert.equal(S.prizeById('5').id, 'c5'); // legacy stored value
  assert.equal(S.prizeById('pro').pro, true);
});
