// YouTube OAuth helpers. Tokens live only in httpOnly cookies.
export const YT_REDIRECT = 'https://viralaiclipper.com/api/youtube/callback';
export const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };

export async function refreshAccessToken(refresh) {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!refresh || !id || !secret) return null;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const d = await r.json().catch(() => ({}));
  return d.access_token ? d : null;
}
