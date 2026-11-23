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
  // Each hand-off re-arms exactly one claim (continued: false); replays are refused.
  if (meta.done || meta.continued) return null;
  await touchJob(id, { continued: true, kick: 0 });
  await acquireLock(id, 'hop');
  return { jobId: id, ...meta, hops: Number(meta.hops) || 1 };
}

// Called by the invocation that is handing off, right before it calls the next one.
export async function armContinuation(id, hops) {
  await releaseLock(id);
  await touchJob(id, { continued: false, hops });
}

const TTL = 60 * 60 * 6;
const evKey = (id) => `job:${id}:ev`;
const metaKey = (id) => `job:${id}:meta`;
const lockKey = (id) => `job:${id}:lock`;
export const jobsEnabled = kvEnabled;
// A running job writes a heartbeat every 10s and refreshes this lock. Silence for this
// long means the worker died and a poll can resume the same job (slices stay in KV/Blob).
export const LOST_MS = 90000;
const LOCK_TTL = 90;

export function newJobId() {
  return (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2))).replace(/-/g, '');
}
export const validJobId = (id) => typeof id === 'string' && /^[a-z0-9]{8,40}$/i.test(id);

async function pipe(cmds) {
  for (const c of cmds) await kvCommand(c);
}

async function acquireLock(id, who = '1') {
  try { await kvCommand(['SET', lockKey(id), who, 'EX', String(LOCK_TTL)]); } catch {}
}
async function refreshLock(id) {
  try { await kvCommand(['SET', lockKey(id), '1', 'EX', String(LOCK_TTL)]); } catch {}
}
export async function releaseLock(id) {
  try { await kvCommand(['DEL', lockKey(id)]); } catch {}
}

export async function createJob(id, meta) {
  await pipe([
    ['SET', metaKey(id), JSON.stringify({ ...meta, startedAt: Date.now(), hb: Date.now(), done: false }), 'EX', String(TTL)],
    ['SET', lockKey(id), '1', 'EX', String(LOCK_TTL)],
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
    if (!patch.done) await refreshLock(id);
  } catch {}
}

export async function refundLostJob(id, meta) {
  const first = await kvCommand(['SET', `job:${id}:refunded`, '1', 'NX', 'EX', String(TTL)]).catch(() => null);
  if (first && !meta?.refunded) {
    await refundSlot(meta.slotKey);
    if (meta.creditSpent && meta.email) await refundCredit(meta.email).catch(() => {});
    await touchJob(id, { refunded: true, done: true, lost: true });
    return true;
  }
  return false;
}

// Read events from index `from`. Stale (no heartbeat) jobs are flagged but not refunded
// yet — the poll endpoint tries to resume them first.
export async function readJob(id, from = 0) {
  const raw = await kvCommand(['GET', metaKey(id)]).catch(() => null);
  if (!raw) return { found: false };
  const meta = JSON.parse(raw);
  const events = ((await kvCommand(['LRANGE', evKey(id), String(from), '-1']).catch(() => [])) || []).map(e => { try { return JSON.parse(e); } catch { return null; } }).filter(Boolean);
  const stale = !meta.done && Date.now() - (meta.hb || meta.startedAt || 0) > LOST_MS;
  return {
    found: true,
    done: !!meta.done,
    stale,
    lost: !!meta.lost,
    events,
    next: from + events.length,
    hops: Number(meta.hops) || 0,
    hasPayload: !!meta.payload,
    kick: !!meta.kick && !meta.continued && !meta.done,
  };
}

export async function readJobMeta(id) {
  const raw = await kvCommand(['GET', metaKey(id)]).catch(() => null);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Claim a dead job so GET can start a fresh invocation with the saved payload.
// Returns the meta when the lock was free (worker definitely gone); otherwise null.
export async function claimStaleResume(request) {
  const id = request.headers.get('x-resume-job');
  const sig = request.headers.get('x-resume-sig');
  if (!id || !sig || !validJobId(id)) return null;
  const want = Buffer.from(continueSig(id)); const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  const raw = await kvCommand(['GET', metaKey(id)]).catch(() => null);
  if (!raw) return null;
  const meta = JSON.parse(raw);
  if (meta.done) return null;
  if (Date.now() - (meta.hb || meta.startedAt || 0) < LOST_MS) return null;
  const gotLock = await kvCommand(['SET', lockKey(id), 'resume', 'NX', 'EX', String(LOCK_TTL)]).catch(() => null);
  if (gotLock !== 'OK') return null;
  const hops = (Number(meta.hops) || 1) + 1;
  await touchJob(id, { continued: true, hops, resumedAt: Date.now() });
  return { jobId: id, ...meta, hops, staleResume: true };
}

// Fire a resume POST for a stale job. Caller must already have confirmed it is stale.
export async function kickResume(id, origin, payload) {
  if (!validJobId(id) || !payload || !origin) return false;
  const headers = { 'Content-Type': 'application/json', 'x-resume-job': id, 'x-resume-sig': continueSig(id) };
  try {
    const res = await fetch(`${origin}/api/generate`, { method: 'POST', headers, body: JSON.stringify(payload), cache: 'no-store' });
    try { res.body?.cancel().catch(() => {}); } catch {}
    return res.ok;
  } catch (e) {
    console.warn('kickResume failed', e?.message);
    return false;
  }
}

// One poll wins the right to start a pending hand-off (see GET ?job= in the generate route).
export async function claimKick(id) {
  if (!validJobId(id)) return false;
  const got = await kvCommand(['SET', `job:${id}:kick`, '1', 'NX', 'EX', '45']).catch(() => null);
  return got === 'OK';
}

// Start the armed continuation of a job (same signed hand-off the worker itself sends).
export async function kickContinue(id, origin, payload, fetchFn = fetch) {
  if (!validJobId(id) || !payload || !origin) return false;
  const headers = { 'Content-Type': 'application/json', 'x-continue-job': id, 'x-continue-sig': continueSig(id) };
  try {
    const res = await fetchFn(`${origin}/api/generate`, { method: 'POST', headers, body: JSON.stringify(payload), cache: 'no-store' });
    try { res.body?.cancel().catch(() => {}); } catch {}
    return res.ok && res.status !== 204;
  } catch (e) {
    console.warn('kickContinue failed', e?.message);
    return false;
  }
}
