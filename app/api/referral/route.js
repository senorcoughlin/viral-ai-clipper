export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import { getOrCreateCode, referralStats, REFERRAL_CREDITS, REFERRAL_CAP } from '../../../lib/referral';

// GET -> the signed-in user's referral link and how many friends joined with it.
export async function GET(request) {
  const s = getSession(request);
  const base = { credits: REFERRAL_CREDITS, cap: REFERRAL_CAP };
  if (!s?.verified) return NextResponse.json({ success: true, signedIn: false, ...base }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const code = await getOrCreateCode(s.email);
    if (!code) return NextResponse.json({ success: false, signedIn: true, message: 'Referrals are unavailable right now', ...base }, { status: 503 });
    const { count } = await referralStats(code);
    return NextResponse.json({ success: true, signedIn: true, code, link: `https://viralaiclipper.com/?ref=${code}`, count, ...base }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ success: false, signedIn: true, message: 'Referrals are unavailable right now', ...base }, { status: 503 });
  }
}
