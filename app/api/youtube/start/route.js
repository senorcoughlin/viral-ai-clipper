import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { YT_REDIRECT, COOKIE_OPTS } from '../../../../lib/youtube';
import { safeNext } from '../../../../lib/nextpath';

export async function GET(request) {
  const next = safeNext(new URL(request.url).searchParams.get('next'));
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) return NextResponse.json({ success: false, message: 'GOOGLE_CLIENT_ID missing' }, { status: 500 });
  const state = crypto.randomBytes(24).toString('base64url');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', id);
  url.searchParams.set('redirect_uri', YT_REDIRECT);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/youtube.upload');
  url.searchParams.set('state', state);
  const res = NextResponse.redirect(url.toString());
  res.cookies.set('yt_state', state, { ...COOKIE_OPTS, maxAge: 600 });
  res.cookies.set('yt_next', next, { ...COOKIE_OPTS, maxAge: 600 });
  return res;
}
