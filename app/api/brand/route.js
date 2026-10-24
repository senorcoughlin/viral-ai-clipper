export const dynamic = 'force-dynamic';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import { sanitizeBrand } from '../../../lib/render';
import { kvEnabled, kvGetJson, kvSetJson } from '../../../lib/kv';

const key = (email) => 'brand:' + crypto.createHash('sha256').update(email).digest('hex').slice(0, 32);

// Brand kit for the signed-in user (any session). Signed-out users keep it in localStorage.
export async function GET(request) {
  const s = getSession(request);
  if (!s || !kvEnabled) return NextResponse.json({ success: true, signedIn: !!s, brand: null });
  return NextResponse.json({ success: true, signedIn: true, brand: await kvGetJson(key(s.email)) });
}

export async function POST(request) {
  const s = getSession(request);
  if (!s) return NextResponse.json({ success: false, message: 'Sign in to save your brand kit' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const brand = sanitizeBrand(body.brand) || {};
  if (kvEnabled) await kvSetJson(key(s.email), brand, 365 * 24 * 3600);
  return NextResponse.json({ success: true, brand });
}
