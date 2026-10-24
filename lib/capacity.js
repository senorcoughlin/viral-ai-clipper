// Hard monthly cap on RenderIO commands. Every submit reserves one slot with an
// atomic Redis INCR (rolled back if over cap or if the submit is rejected).
// The billing cycle starts on RENDERIO_CYCLE_DAY (default 25) in America/New_York.
import { kvEnabled, kvCommand } from './kv';
import { checkUsageThreshold } from './alerts';

export const RENDERIO_CAP = Number(process.env.RENDERIO_MONTHLY_CAP || 500);
const CYCLE_DAY = Math.min(28, Math.max(1, Number(process.env.RENDERIO_CYCLE_DAY || 25)));
export const CAPACITY_MESSAGE = 'We are at capacity for video processing right now. Please try again later — this run was not counted.';

export class CapacityError extends Error {
  constructor() { super(CAPACITY_MESSAGE); this.capacity = true; }
}

export function cycleId(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(x => [x.type, x.value]));
  let y = +p.year, m = +p.month;
  if (+p.day < CYCLE_DAY) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
  return `${y}-${String(m).padStart(2, '0')}-${String(CYCLE_DAY).padStart(2, '0')}`;
}
const key = () => `rio:cycle:${cycleId()}`;

export async function renderioUsed() {
  if (!kvEnabled) return 0;
  try { return Number(await kvCommand(['GET', key()])) || 0; } catch { return 0; }
}
export async function renderioLeft() {
  return RENDERIO_CAP - (await renderioUsed());
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
  let done = false;
  return async () => { if (!done) { done = true; await kvCommand(['DECR', k]).catch(() => {}); } };
}
