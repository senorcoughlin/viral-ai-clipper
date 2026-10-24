export const dynamic = 'force-dynamic';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { kvEnabled, kvGetJson, kvCommand } from '../../../lib/kv';
import { ownerKey, withAnon } from '../../../lib/owner';

const STATUSES = ['allowed', 'pending', 'no'];
const MAX = 200;
const k = (owner) => 'perm:' + owner;
const str = (v, n) => String(v ?? '').trim().slice(0, n);

function clean(e) {
  const url = str(e.channelUrl, 300);
  const split = e.split === '' || e.split == null ? null : Math.min(100, Math.max(0, Number(e.split)));
  return {
    name: str(e.name, 80),
    channelUrl: /^https?:\/\//i.test(url) ? url : '',
    status: STATUSES.includes(e.status) ? e.status : 'pending',
    terms: str(e.terms, 1000),
    split: Number.isFinite(split) ? split : null,
    notes: str(e.notes, 1000),
  };
}
async function load(owner) { return (await kvGetJson(k(owner))) || []; }
async function save(owner, list) { await kvCommand(['SET', k(owner), JSON.stringify(list)]); }
const out = (o, body, status = 200) => withAnon(NextResponse.json(body, { status }), o.anonNew);

export async function GET(request) {
  const o = ownerKey(request);
  if (!kvEnabled) return out(o, { success: false, message: 'Storage not configured' }, 503);
  return out(o, { success: true, signedIn: o.key.startsWith('email:'), items: await load(o.key) });
}

// Create (no id) or update (id).
export async function POST(request) {
  const o = ownerKey(request);
  if (!kvEnabled) return out(o, { success: false, message: 'Storage not configured' }, 503);
  const body = await request.json().catch(() => ({}));
  const e = clean(body);
  if (!e.name) return out(o, { success: false, message: 'Streamer name is required' }, 400);
  const list = await load(o.key);
  const now = Date.now();
  if (body.id) {
    const i = list.findIndex(x => x.id === body.id);
    if (i < 0) return out(o, { success: false, message: 'Not found' }, 404);
    list[i] = { ...list[i], ...e, updatedAt: now };
  } else {
    if (list.length >= MAX) return out(o, { success: false, message: 'Limit reached' }, 400);
    list.unshift({ id: crypto.randomBytes(6).toString('hex'), ...e, createdAt: now, updatedAt: now });
  }
  await save(o.key, list);
  return out(o, { success: true, items: list });
}

export async function DELETE(request) {
  const o = ownerKey(request);
  if (!kvEnabled) return out(o, { success: false, message: 'Storage not configured' }, 503);
  const id = new URL(request.url).searchParams.get('id');
  const list = (await load(o.key)).filter(x => x.id !== id);
  await save(o.key, list);
  return out(o, { success: true, items: list });
}
