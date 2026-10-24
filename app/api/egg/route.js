export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { paidEmail, getSession } from '../../../lib/session';
import { addCredits } from '../../../lib/billing';
import { allowAttempt, clientIp } from '../../../lib/ratelimit';

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// Hidden easter egg: correct password gives 500 credits, once per verified email.
export async function POST(request) {
  const secret = process.env.EGG_PASSWORD;
  if (!secret) return NextResponse.json({ success: false, message: 'Not available' }, { status: 404 });
  if (!(await allowAttempt(`egg:ip:${clientIp(request)}`, 5, 3600))) return NextResponse.json({ success: false, message: 'Too many tries. Try again later.' }, { status: 429 });
  const { password } = await request.json().catch(() => ({}));
  if (!same(password || '', secret)) return NextResponse.json({ success: false, message: 'Wrong password' }, { status: 401 });
  const email = paidEmail(request);
  if (!email) {
    const s = getSession(request);
    return NextResponse.json({ success: false, needEmail: true, email: s?.email || '', message: 'Correct! To claim it, confirm your email: we\'ll send you a sign-in link. Open it, then come back and unlock again.' }, { status: 401 });
  }
  const r = await addCredits(email, 500, `egg:${email}`);
  if (r.duplicate) return NextResponse.json({ success: false, message: 'You already claimed this one.', credits: r.credits }, { status: 409 });
  return NextResponse.json({ success: true, message: '500 free generations unlocked!', credits: r.credits });
}
