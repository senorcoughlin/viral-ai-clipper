import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { requireAdmin } from './adminauth';

function keyOk(got, want) {
  if (!want || !got) return false;
  const a = crypto.createHash('sha256').update(String(got)).digest();
  const b = crypto.createHash('sha256').update(String(want)).digest();
  return crypto.timingSafeEqual(a, b);
}

// Allowed: header `x-raffle-admin-key: $RAFFLE_ADMIN_KEY`, or a signed-in guest admin session.
export async function requireRaffleAdmin(request, { write = false } = {}) {
  if (keyOk(request.headers.get('x-raffle-admin-key'), process.env.RAFFLE_ADMIN_KEY)) return null;
  const denied = await requireAdmin(request, { write });
  return denied || null;
}

export function cronOk(request) {
  const want = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  return !!want && keyOk(auth.replace(/^Bearer\s+/i, ''), want);
}

export const noStore = { 'Cache-Control': 'no-store' };
export const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: noStore });
