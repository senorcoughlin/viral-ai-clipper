import { flagOn } from '../../../../lib/siteconfig';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { reportError } from '../../../../lib/alerts';
import { createMagicToken } from '../../../../lib/magic';
import { allowAttempt, clientIp } from '../../../../lib/ratelimit';
import { routeGuard } from '../../../../lib/ratelimit';
import { safeNext } from '../../../../lib/nextpath';

// POST { email } -> emails a one-time sign-in link (via Resend).
export async function POST(request) {
  const limited = await routeGuard(request, 'auth_email', 30, 3600);
  if (limited) return limited;
  if (await flagOn('pause_signin')) return Response.json({ error: 'Sign-in is paused for a few minutes. Please try again soon.' }, { status: 503 });
  const { email, next } = await request.json().catch(() => ({}));
  const clean = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 200) {
    return NextResponse.json({ success: false, message: 'Enter a valid email' }, { status: 400 });
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ success: false, message: 'Email sign-in is not set up yet. Use your password or purchase link for now.' }, { status: 503 });
  if (!(await allowAttempt(`magic:ip:${clientIp(request)}`, 10, 3600)) || !(await allowAttempt(`magic:em:${clean}`, 3, 3600))) {
    return NextResponse.json({ success: false, message: 'Too many sign-in emails. Try again in an hour.' }, { status: 429 });
  }
  try {
    const token = await createMagicToken(clean);
    const n = safeNext(next);
    const link = `https://viralaiclipper.com/api/auth/verify?t=${encodeURIComponent(token)}${n !== '/' ? `&next=${encodeURIComponent(n)}` : ''}`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Viral AI Clipper <login@viralaiclipper.com>',
        to: [clean],
        subject: 'Your Viral AI Clipper sign-in link',
        text: `Click to sign in (valid for 15 minutes, works once):\n\n${link}\n\nIf you didn't ask for this, ignore this email.`,
        html: `<p>Click to sign in to Viral AI Clipper. The link works once and expires in 15 minutes.</p><p><a href="${link}">Sign in</a></p><p style="color:#888">If you didn't ask for this, ignore this email.</p>`,
      }),
    });
    if (!res.ok) {
      await reportError('auth-email', `Resend returned ${res.status}`);
      console.warn('resend failed', res.status, (await res.text().catch(() => '')).slice(0, 200));
      return NextResponse.json({ success: false, message: 'Could not send the email. Try again later.' }, { status: 502 });
    }
    return NextResponse.json({ success: true, message: 'Check your inbox for a sign-in link.' });
  } catch (e) {
    console.error('magic link error', e?.message);
    await reportError('auth-email', e);
    return NextResponse.json({ success: false, message: 'Could not send the email. Try again later.' }, { status: 500 });
  }
}
