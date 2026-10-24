import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { YT_REDIRECT, COOKIE_OPTS } from '../../../../lib/youtube';
import { readCookie } from '../../../../lib/session';

const fail = () => {
  const res = NextResponse.redirect('https://viralaiclipper.com/?youtube=error');
  res.cookies.set('yt_state', '', { ...COOKIE_OPTS, maxAge: 0 });
  return res;
};

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const code = params.get('code');
  const state = params.get('state') || '';
  const expected = readCookie(request, 'yt_state') || '';
  // CSRF: the state must match the one we set when the flow started.
  if (!state || !expected || state.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected))) {
    return fail();
  }
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!code || !id || !secret) return fail();
  const token = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: YT_REDIRECT, grant_type: 'authorization_code' }),
  });
  const data = await token.json().catch(() => ({}));
  if (!data.access_token) return fail();
  const res = NextResponse.redirect('https://viralaiclipper.com/?youtube=connected');
  res.cookies.set('yt_state', '', { ...COOKIE_OPTS, maxAge: 0 });
  res.cookies.set('yt_access', data.access_token, { ...COOKIE_OPTS, maxAge: Math.max(60, Number(data.expires_in || 3600) - 60) });
  if (data.refresh_token) res.cookies.set('yt_refresh', data.refresh_token, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 30 });
  return res;
}
