// Hard monthly cap on RenderIO commands, plus a dollar overage budget.
// Every submit reserves one slot with an atomic Redis INCR (rolled back if over
// the hard cap or if the submit is rejected). When estimated overage reaches
// RENDERIO_OVERAGE_BUDGET_USD, new work is routed to local ffmpeg instead of
// being refused. The billing cycle starts on RENDERIO_CYCLE_DAY (default 24,
// matching the Pro plan anniversary) in America/New_York.
import { kvEnabled, kvCommand } from './kv';
import { checkUsageThreshold, checkOverageThreshold } from './alerts';

export const RENDERIO_CAP = Number(process.env.RENDERIO_MONTHLY_CAP || 500);
export const RENDERIO_PLAN_COMMANDS = Number(process.env.RENDERIO_PLAN_COMMANDS || 5000);
export const RENDERIO_OVERAGE_USD_PER_CMD = Number(process.env.RENDERIO_OVERAGE_USD_PER_CMD || 0.05);
export const RENDERIO_OVERAGE_BUDGET_USD = Number(process.env.RENDERIO_OVERAGE_BUDGET_USD || 35);
const CYCLE_DAY = Math.min(28, Math.max(1, Number(process.env.RENDERIO_CYCLE_DAY || 24)));
export const CAPACITY_MESSAGE = 'We are at capacity for video processing right now. Please try again later — this run was not counted.';

export class CapacityError extends Error {
  constructor() { super(CAPACITY_MESSAGE); this.capacity = true; }
}

export class BudgetError extends Error {
  constructor() {
    super('renderio overage budget reached; using local ffmpeg');
    this.budget = true;
  }
}

export function cycleId(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(x => [x.type, x.value]));
  let y = +p.year, m = +p.month;
  if (+p.day < CYCLE_DAY) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
  return `${y}-${String(m).padStart(2, '0')}-${String(CYCLE_DAY).padStart(2, '0')}`;
}
const key = () => `rio:cycle:${cycleId()}`;
const secKey = () => `rio:cycle:ms:${cycleId()}`;

export function overageCommands(used) {
  return Math.max(0, (Number(used) || 0) - RENDERIO_PLAN_COMMANDS);
}

export function estimatedOverageUsd(used) {
  return Math.round(overageCommands(used) * RENDERIO_OVERAGE_USD_PER_CMD * 100) / 100;
}

// Included commands plus how many overage commands fit under the dollar budget.
export function renderioBudgetCommands() {
  const rate = RENDERIO_OVERAGE_USD_PER_CMD;
  const extra = rate > 0 ? Math.floor(RENDERIO_OVERAGE_BUDGET_USD / rate) : 0;
  return RENDERIO_PLAN_COMMANDS + Math.max(0, extra);
}

export function isOverBudget(used) {
  return (Number(used) || 0) >= renderioBudgetCommands();
}

export async function renderioUsed() {
  if (!kvEnabled) return 0;
  try { return Number(await kvCommand(['GET', key()])) || 0; } catch { return 0; }
}
export async function renderioLeft() {
  return RENDERIO_CAP - (await renderioUsed());
}

export async function renderioSeconds() {
  if (!kvEnabled) return 0;
  try { return (Number(await kvCommand(['GET', secKey()])) || 0) / 1000; } catch { return 0; }
}

export async function recordRenderioSeconds(sec) {
  if (!kvEnabled) return;
  const n = Math.max(0, Math.round(Number(sec) * 1000));
  if (!n) return;
  try {
    const k = secKey();
    const v = Number(await kvCommand(['INCRBY', k, String(n)]));
    if (v === n) await kvCommand(['EXPIRE', k, String(40 * 24 * 3600)]).catch(() => {});
  } catch {}
}

export async function renderioUsage() {
  const used = await renderioUsed();
  const seconds = await renderioSeconds();
  const budgetCmds = renderioBudgetCommands();
  const overageUsd = estimatedOverageUsd(used);
  return {
    used,
    cap: RENDERIO_CAP,
    plan: RENDERIO_PLAN_COMMANDS,
    overage: overageCommands(used),
    overageUsd,
    rate: RENDERIO_OVERAGE_USD_PER_CMD,
    budgetUsd: RENDERIO_OVERAGE_BUDGET_USD,
    budgetCmds,
    leftOnBudget: Math.max(0, budgetCmds - used),
    overBudget: isOverBudget(used),
    seconds,
    cycle: cycleId(),
  };
}

export async function renderioOverBudget() {
  const used = await renderioUsed();
  const over = isOverBudget(used);
  if (over) checkOverageThreshold(used, renderioBudgetCommands(), estimatedOverageUsd(used), RENDERIO_OVERAGE_BUDGET_USD, cycleId()).catch(() => {});
  return over;
}

// Reserve one command slot or throw CapacityError. Returns a release() to undo.
export async function reserveRenderio() {
  if (!kvEnabled) return () => {};
  const k = key();
  const n = Number(await kvCommand(['INCR', k]));
  if (n === 1) await kvCommand(['EXPIRE', k, String(40 * 24 * 3600)]).catch(() => {});
  if (n > RENDERIO_CAP) {
    await kvCommand(['DECR', k]).catch(() => {});
    throw new CapacityError();
  }
  checkUsageThreshold(n, RENDERIO_CAP, cycleId()).catch(() => {});
  // Allow the command that lands exactly on the dollar budget; block the next one.
  if (n > renderioBudgetCommands()) {
    await kvCommand(['DECR', k]).catch(() => {});
    throw new BudgetError();
  }
  checkOverageThreshold(n, renderioBudgetCommands(), estimatedOverageUsd(n), RENDERIO_OVERAGE_BUDGET_USD, cycleId()).catch(() => {});
  let done = false;
  return async () => { if (!done) { done = true; await kvCommand(['DECR', k]).catch(() => {}); } };
}
