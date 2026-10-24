import { NextResponse } from 'next/server';

export async function GET(request) {
  const code = new URL(request.url).searchParams.get('code');
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!code || !id || !secret) {
    return NextResponse.redirect('https://viralaiclipper.com/?youtube=error');
  }
  const body = new URLSearchParams({
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: 'https://viralaiclipper.com/api/youtube/callback',
    grant_type: 'authorization_code',
  });
  const token = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await token.json();
  if (!data.access_token) {
    return NextResponse.redirect('https://viralaiclipper.com/?youtube=error');
  }
  // Store the refresh token server-side via a short-lived cookie the client can read once.
  const res = NextResponse.redirect('https://viralaiclipper.com/?youtube=connected');
  res.cookies.set('yt_access', data.access_token, { httpOnly: false, secure: true, maxAge: 3500, path: '/' });
  if (data.refresh_token) {
    res.cookies.set('yt_refresh', data.refresh_token, { httpOnly: true, secure: true, maxAge: 60 * 60 * 24 * 30, path: '/' });
  }
  return res;
}
