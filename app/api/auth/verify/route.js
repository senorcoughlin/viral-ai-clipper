export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { consumeMagicToken } from '../../../../lib/magic';
import { setSessionCookie } from '../../../../lib/session';
import { routeGuard } from '../../../../lib/ratelimit';
import { kvEnabled, kvCommand } from '../../../../lib/kv';
import crypto from 'crypto';
import { readCookie } from '../../../../lib/session';
import { applyReferral, REF_COOKIE } from '../../../../lib/referral';
import { safeNext } from '../../../../lib/nextpath';

const SITE = 'https://viralaiclipper.com';
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// GET only shows a confirm page. Email apps and link scanners (Gmail, Outlook Safe Links)
// prefetch GET links, which used to burn the one-time token before the user tapped it.
// The token is consumed only on the POST from the button below.
export async function GET(request) {
  const t = new URL(request.url).searchParams.get('t') || '';
  const nx = safeNext(new URL(request.url).searchParams.get('next'));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Sign in · Viral AI Clipper</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0c;color:#f4f4f5;font-family:system-ui,-apple-system,sans-serif}main{width:min(92vw,360px);text-align:center;padding:28px;border:1px solid #27272a;border-radius:16px;background:#141416}button{width:100%;height:46px;border:0;border-radius:10px;background:#c6ff3d;color:#0b0b0c;font-weight:700;font-size:16px;cursor:pointer}p{color:#a1a1aa;font-size:14px}</style></head>
<body><main><h1 style="font-size:20px">Sign in to Viral AI Clipper</h1><p>Tap the button to finish signing in on this device.</p>
<form method="POST" action="/api/auth/verify"><input type="hidden" name="t" value="${esc(t)}"><input type="hidden" name="next" value="${esc(nx)}"><button type="submit">Sign in</button></form></main></body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

export async function POST(request) {
  const limited = await routeGuard(request, 'auth_verify', 30, 600);
  if (limited) return limited;
  let t = '', nx = '/';
  try { const f = await request.formData(); t = String(f.get('t') || ''); nx = safeNext(f.get('next')); } catch {}
  const email = await consumeMagicToken(t).catch(() => null);
  // 303 so the browser follows with a GET.
  if (!email) return NextResponse.redirect(`${SITE}${nx}?signin=expired`, 303);
  // First verified sign-in for this email -> ?signin=new so the client fires the sign_up conversion once.
  let flag = 'ok';
  if (kvEnabled) {
    try {
      const k = 'seen_user:' + crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 32);
      const r = await kvCommand(['SET', k, '1', 'NX']);
      if (r === 'OK') flag = 'new';
    } catch {}
  }
  let refOk = false;
  if (flag === 'new') {
    try { refOk = await applyReferral(email, String(readCookie(request, REF_COOKIE) || '').toLowerCase()); } catch {}
  }
  const res = setSessionCookie(NextResponse.redirect(`${SITE}${nx}?signin=${flag}${refOk ? '&ref_bonus=1' : ''}`, 303), { email, verified: true });
  if (flag === 'new') res.cookies.set(REF_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
