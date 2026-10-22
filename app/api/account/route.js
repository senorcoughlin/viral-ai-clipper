export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';
import crypto from 'crypto';

function emailKey(email) {
  return crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 24);
}
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password), salt, 100000, 32, 'sha256').toString('hex');
}
function accountPath(email) {
  return `accounts/${emailKey(email)}.json`;
}

async function readAccount(email) {
  const path = accountPath(email);
  const { blobs } = await list({ prefix: path });
  const hit = blobs.find(b => b.pathname === path) || blobs[0];
  if (!hit?.url) return null;
  const res = await fetch(hit.url, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

async function writeAccount(email, data) {
  await put(accountPath(email), JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, email, password, token, clips } = body;
    const clean = String(email || '').trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      return NextResponse.json({ success: false, message: 'Enter a valid email' }, { status: 400 });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ success: false, message: 'Storage is not configured' }, { status: 500 });
    }

    if (action === 'register') {
      if (!password || String(password).length < 6) {
        return NextResponse.json({ success: false, message: 'Password must be at least 6 characters' }, { status: 400 });
      }
      const existing = await readAccount(clean);
      if (existing) return NextResponse.json({ success: false, message: 'Account already exists. Log in.' }, { status: 409 });
      const salt = crypto.randomBytes(16).toString('hex');
      const session = crypto.randomBytes(24).toString('hex');
      await writeAccount(clean, { email: clean, salt, hash: hashPassword(password, salt), session, clips: [], createdAt: Date.now() });
      return NextResponse.json({ success: true, email: clean, token: session });
    }

    if (action === 'login') {
      const account = await readAccount(clean);
      if (!account) return NextResponse.json({ success: false, message: 'No account for that email' }, { status: 404 });
      if (account.hash !== hashPassword(password, account.salt)) {
        return NextResponse.json({ success: false, message: 'Wrong password' }, { status: 401 });
      }
      const session = crypto.randomBytes(24).toString('hex');
      account.session = session;
      await writeAccount(clean, account);
      return NextResponse.json({ success: true, email: clean, token: session, clips: account.clips || [] });
    }

    if (action === 'save' || action === 'load') {
      const account = await readAccount(clean);
      if (!account || account.session !== token) {
        return NextResponse.json({ success: false, message: 'Not signed in' }, { status: 401 });
      }
      if (action === 'save') {
        account.clips = Array.isArray(clips) ? clips.slice(0, 100) : [];
        await writeAccount(clean, account);
      }
      return NextResponse.json({ success: true, clips: account.clips || [] });
    }

    return NextResponse.json({ success: false, message: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e?.message || e), stack: String(e?.stack || '').slice(0, 300) }, { status: 500 });
  }
}
