import { NextResponse } from 'next/server';

export async function GET() {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) return NextResponse.json({ success: false, message: 'GOOGLE_CLIENT_ID missing' }, { status: 500 });
  const redirect = 'https://viralaiclipper.com/api/youtube/callback';
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', id);
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/youtube.upload');
  return NextResponse.redirect(url.toString());
}
