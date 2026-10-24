export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { consumeMagicToken } from '../../../../lib/magic';
import { setSessionCookie } from '../../../../lib/session';
import { routeGuard } from '../../../../lib/ratelimit';

// The email address is proven by clicking the link, so the session is verified
// and paid perks for that email apply.
export async function GET(request) {
  const limited = await routeGuard(request, 'auth_verify', 30, 600);
  if (limited) return limited;
  const t = new URL(request.url).searchParams.get('t');
  const email = await consumeMagicToken(t).catch(() => null);
  if (!email) return NextResponse.redirect('https://viralaiclipper.com/?signin=expired');
  return setSessionCookie(NextResponse.redirect('https://viralaiclipper.com/?signin=ok'), { email, verified: true });
}
