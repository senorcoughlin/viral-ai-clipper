// Server-side entitlements (Pro + credits). Uses Upstash Redis when configured,
// otherwise private Vercel Blob JSON files.
import crypto from 'crypto';
import { put, list } from '@vercel/blob';
import { kvEnabled, kvCommand } from './kv';
import { loadProUsers } from './pro';

const norm = (e) => String(e || '').trim().toLowerCase();
const h = (e) => crypto.createHash('sha256').update(norm(e)).digest('hex').slice(0, 32);
const blobOn = () => !!process.env.BLOB_READ_WRITE_TOKEN;

async function blobGet(path) {
  try {
    const { blobs } = await list({ prefix: path });
    const hit = blobs.find(b => b.pathname === path);
    if (!hit) return null;
    const r = await fetch(hit.url, { cache: 'no-store', headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` } });
    return r.ok ? r.json() : null;
  } catch { return null; }
}
async function blobPut(path, data) {
  await put(path, JSON.stringify(data), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
}

async function getRecord(email) {
  const key = `ent:${h(email)}`;
  if (kvEnabled) {
    try { const v = await kvCommand(['GET', key]); if (v) return JSON.parse(v); } catch {}
  } else if (blobOn()) {
    const v = await blobGet(`billing/${h(email)}.json`); if (v) return v;
  }
  return { email: norm(email), pro: false, credits: 0, customerId: null };
}
async function saveRecord(rec) {
  rec.updated = Date.now();
  if (kvEnabled) await kvCommand(['SET', `ent:${h(rec.email)}`, JSON.stringify(rec)]);
  else if (blobOn()) await blobPut(`billing/${h(rec.email)}.json`, rec);
  else throw new Error('No storage configured');
}
async function linkCustomer(customerId, email) {
  if (!customerId) return;
  if (kvEnabled) await kvCommand(['SET', `cust:${customerId}`, norm(email)]);
  else if (blobOn()) await blobPut(`billing/cust_${customerId}.json`, { email: norm(email) });
}
export async function emailForCustomer(customerId) {
  if (!customerId) return null;
  if (kvEnabled) { try { return await kvCommand(['GET', `cust:${customerId}`]); } catch { return null; } }
  if (blobOn()) return (await blobGet(`billing/cust_${customerId}.json`))?.email || null;
  return null;
}

// Credits live in their own Redis integer key so spends and top-ups are atomic.
// The JSON record's `credits` field seeds that key once (migration) and is the
// best-effort store when only Blob is configured.
const ckey = (email) => `credits:${h(email)}`;
const skey = (email) => `credsess:${h(email)}`;

async function kvCredits(email) {
  const v = await kvCommand(['GET', ckey(email)]);
  if (v !== null && v !== undefined) return Number(v) || 0;
  const rec = await getRecord(email);
  const seed = Math.max(0, Number(rec.credits) || 0);
  await kvCommand(['SET', ckey(email), String(seed), 'NX']);
  return Number(await kvCommand(['GET', ckey(email)])) || 0;
}

export async function getCredits(email) {
  if (kvEnabled) { try { return Math.max(0, await kvCredits(email)); } catch { return 0; } }
  const rec = await getRecord(email);
  return Math.max(0, Number(rec.credits) || 0);
}

export async function getEntitlement(email) {
  if (!norm(email).includes('@')) return { pro: false, credits: 0 };
  const rec = await getRecord(email);
  let pro = !!rec.pro;
  if (!pro && !rec.proRevoked && blobOn()) { // legacy Blob pro list
    try { pro = (await loadProUsers()).has(norm(email)); } catch {}
  }
  return { pro, credits: await getCredits(email) };
}

export async function addCredits(email, n, sessionId) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  if (kvEnabled) {
    await kvCredits(email); // make sure the counter is seeded before adding
    if (sessionId) {
      const isNew = await kvCommand(['SADD', skey(email), sessionId]);
      if (!Number(isNew)) return { credits: await getCredits(email), duplicate: true };
    }
    const total = await kvCommand(['INCRBY', ckey(email), String(n)]);
    return { credits: Number(total) || 0 };
  }
  const rec = await getRecord(email);
  rec.sessions = rec.sessions || [];
  if (sessionId && rec.sessions.includes(sessionId)) return { credits: rec.credits, duplicate: true };
  rec.credits = (Number(rec.credits) || 0) + n;
  if (sessionId) rec.sessions = [...rec.sessions, sessionId].slice(-50);
  await saveRecord(rec);
  return { credits: rec.credits };
}

export async function setPro(email, on, customerId) {
  const rec = await getRecord(email);
  rec.pro = !!on;
  rec.proRevoked = !on;
  if (customerId) rec.customerId = customerId;
  await saveRecord(rec);
  if (customerId) await linkCustomer(customerId, email);
  return rec;
}

export async function consumeCredit(email) {
  if (kvEnabled) {
    await kvCredits(email);
    const left = Number(await kvCommand(['DECRBY', ckey(email), '1']));
    if (left < 0) { await kvCommand(['INCRBY', ckey(email), '1']); return false; }
    return true;
  }
  const rec = await getRecord(email);
  if ((Number(rec.credits) || 0) <= 0) return false;
  rec.credits = Number(rec.credits) - 1;
  await saveRecord(rec);
  return true;
}

export async function refundCredit(email) {
  if (kvEnabled) { await kvCommand(['INCRBY', ckey(email), '1']); return; }
  const rec = await getRecord(email);
  rec.credits = (Number(rec.credits) || 0) + 1;
  await saveRecord(rec);
}

