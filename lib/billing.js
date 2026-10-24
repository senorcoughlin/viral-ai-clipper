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

export async function getEntitlement(email) {
  if (!norm(email).includes('@')) return { pro: false, credits: 0 };
  const rec = await getRecord(email);
  let pro = !!rec.pro;
  if (!pro && !rec.proRevoked && blobOn()) { // legacy Blob pro list
    try { pro = (await loadProUsers()).has(norm(email)); } catch {}
  }
  return { pro, credits: Math.max(0, Number(rec.credits) || 0) };
}
export async function addCredits(email, n, sessionId) {
  const rec = await getRecord(email);
  rec.sessions = rec.sessions || [];
  if (sessionId && rec.sessions.includes(sessionId)) return rec; // idempotent on webhook retries
  rec.credits = (Number(rec.credits) || 0) + Number(n);
  if (sessionId) rec.sessions = [...rec.sessions, sessionId].slice(-50);
  await saveRecord(rec);
  return rec;
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
  const rec = await getRecord(email);
  if ((Number(rec.credits) || 0) <= 0) return false;
  rec.credits = Number(rec.credits) - 1;
  await saveRecord(rec);
  return true;
}
