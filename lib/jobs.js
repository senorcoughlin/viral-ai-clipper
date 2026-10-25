// Background generation jobs. Each event the generator emits is appended to a Redis
// list so the client can reconnect (tab hidden, app switched, page reloaded) and
// replay/poll from where it left off while the server keeps working.
import { kvCommand, kvEnabled } from './kv';
import { refundSlot } from './ratelimit';
import { refundCredit } from './billing';
import crypto from 'crypto';

// A run can hand itself off to a fresh function invocation (same job id) when one
// invocation's time budget isn't enough. The follow-up request is HMAC-signed.
export const continueSig = (id) => crypto.createHmac('sha256', String(process.env.SESSION_SECRET) + ':continue').update(id).digest('hex');
export async function readContinuation(request) {
  const id = request.headers.get('x-continue-job');
  const sig = request.headers.get('x-continue-sig');
  if (!id || !sig || !validJobId(id)) return null;
  const want = Buffer.from(continueSig(id)); const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  const raw = await kvCommand(['GET', metaKey(id)]).catch(() => null);
  if (!raw) return null;
  const meta = JSON.parse(raw);
  if (meta.done || meta.continued) return null; // only one hand-off per job
  await touchJob(id, { continued: true });
  return { jobId: id, ...meta };
}

const TTL = 60 * 60 * 6;
const evKey = (id) => `job:${id}:ev`;
const metaKey = (id) => `job:${id}:meta`;
export const jobsEnabled = kvEnabled;
// A running job writes a heartbeat every 10s; silence for this long means it died.
const LOST_MS = 75000;

export function newJobId() {
  return (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2))).replace(/-/g, '');
}
export const validJobId = (id) => typeof id === 'string' && /^[a-z0-9]{8,40}$/i.test(id);

async function pipe(cmds) {
  for (const c of cmds) await kvCommand(c);
}

export async function createJob(id, meta) {
  await pipe([
    ['SET', metaKey(id), JSON.stringify({ ...meta, startedAt: Date.now(), hb: Date.now(), done: false }), 'EX', String(TTL)],
  ]);
}

// Returns a writer that appends events in order and can be flushed.
export function jobWriter(id) {
  let chain = Promise.resolve();
  let first = true;
  const push = (obj) => {
    chain = chain.then(async () => {
      await kvCommand(['RPUSH', evKey(id), JSON.stringify(obj)]);
      if (first) { first = false; await kvCommand(['EXPIRE', evKey(id), String(TTL)]); }
    }).catch(() => {});
    return chain;
  };
  return { push, flush: () => chain };
}

export async function touchJob(id, patch = {}) {
  try {
    const raw = await kvCommand(['GET', metaKey(id)]);
    const meta = raw ? JSON.parse(raw) : {};
    await kvCommand(['SET', metaKey(id), JSON.stringify({ ...meta, ...patch, hb: Date.now() }), 'EX', String(TTL)]);
  } catch {}
}

// Read events from index `from`; flags the job lost (and refunds its usage once) if it died.
export async function readJob(id, from = 0) {
  const raw = await kvCommand(['GET', metaKey(id)]).catch(() => null);
  if (!raw) return { found: false };
  const meta = JSON.parse(raw);
  const events = ((await kvCommand(['LRANGE', evKey(id), String(from), '-1']).catch(() => [])) || []).map(e => { try { return JSON.parse(e); } catch { return null; } }).filter(Boolean);
  let lost = false;
  if (!meta.done && Date.now() - (meta.hb || meta.startedAt || 0) > LOST_MS) {
    lost = true;
    const first = await kvCommand(['SET', `job:${id}:refunded`, '1', 'NX', 'EX', String(TTL)]).catch(() => null);
    if (first && !meta.refunded) {
      await refundSlot(meta.slotKey);
      if (meta.creditSpent && meta.email) await refundCredit(meta.email).catch(() => {});
    }
  }
  return { found: true, done: !!meta.done, lost, events, next: from + events.length };
}
