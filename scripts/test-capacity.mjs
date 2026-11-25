import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cycleId, overageCommands, estimatedOverageUsd, renderioBudgetCommands, isOverBudget,
  BudgetError, CapacityError, RENDERIO_PLAN_COMMANDS, RENDERIO_OVERAGE_USD_PER_CMD,
  RENDERIO_OVERAGE_BUDGET_USD,
} from '../lib/capacity.js';
import { isTransientRenderioError, isRenderioUnavailable } from '../lib/render.js';

test('billing cycle starts on the 24th in America/New_York', () => {
  assert.equal(cycleId(new Date('2026-11-24T00:00:00-05:00')), '2026-11-24');
  assert.equal(cycleId(new Date('2026-11-24T21:00:00-05:00')), '2026-11-24');
  assert.equal(cycleId(new Date('2026-11-23T23:59:00-05:00')), '2026-10-24');
  assert.equal(cycleId(new Date('2026-12-23T12:00:00-05:00')), '2026-11-24');
  assert.equal(cycleId(new Date('2026-12-24T00:00:00-05:00')), '2026-12-24');
  assert.equal(cycleId(new Date('2027-01-10T12:00:00-05:00')), '2026-12-24');
});

test('overage math hits the $35 budget at 614 extra commands on the $0.057 default rate', () => {
  assert.equal(RENDERIO_PLAN_COMMANDS, 5000);
  assert.equal(RENDERIO_OVERAGE_USD_PER_CMD, 0.057);
  assert.equal(RENDERIO_OVERAGE_BUDGET_USD, 35);
  assert.equal(renderioBudgetCommands(), 5614);
  assert.equal(overageCommands(0), 0);
  assert.equal(overageCommands(5000), 0);
  assert.equal(overageCommands(5001), 1);
  assert.equal(overageCommands(5614), 614);
  assert.equal(estimatedOverageUsd(5000), 0);
  assert.equal(estimatedOverageUsd(5001), 0.06); // $0.057 rounded to cents
  assert.equal(estimatedOverageUsd(5614), 35);
  assert.equal(isOverBudget(5613), false);
  assert.equal(isOverBudget(5614), true);
  assert.equal(isOverBudget(5700), true);
});

test('budget errors fall back instead of being retried or treated as a paused subscription', () => {
  const e = new BudgetError();
  assert.equal(e.budget, true);
  assert.equal(isTransientRenderioError(e), false);
  assert.equal(isRenderioUnavailable(e), false);
  const cap = new CapacityError();
  assert.equal(cap.capacity, true);
  assert.equal(isTransientRenderioError(cap), false);
});
