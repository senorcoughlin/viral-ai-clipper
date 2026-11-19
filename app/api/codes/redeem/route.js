export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { paidEmail, getSession } from '../../../../lib/session';
import { routeGuard, allowAttempt } from '../../../../lib/ratelimit';
import { grantProDays, addCredits, getEntitlement } from '../../../../lib/billing';
import { emailOwner, reportError } from '../../../../lib/alerts';
import { redeem, rewardText } from '../../../../lib/codes';

const noStore = { 'Cache-Control': 'no-store' };
const out = (b, s = 200) => NextResponse.json(b, { status: s, headers: noStore });

async function grant(email, reward) {
  if (reward.type === 'pro') { const g = await grantProDays(email, reward.days, 'code'); return { proUntil: g.proUntil }; }
  if (reward.type === 'credits') { const r = await addCredits(email, reward.n, `code:${Date.now()}`); return { credits: r.credits }; }
  throw new Error('Unknown reward');
}

// POST { code } -> redeem an on-site code for the signed-in, verified account.
export async function POST(request) {
  const limited = await routeGuard(request, 'code-redeem', 10, 3600);
  if (limited) return limited;
  const email = paidEmail(request);
  if (!email) {
    const s = getSession(request);
    return out({ success: false, needSignIn: true, message: s ? 'Please confirm your email first: use "Email link" sign-in, open the link, then redeem your code.' : 'Sign in to your account to redeem a code.' }, 401);
  }
  if (!(await allowAttempt(`code-redeem:${email}`, 8, 3600).catch(() => true))) return out({ success: false, message: 'Too many tries. Please wait an hour and try again.' }, 429);
  const { code } = await request.json().catch(() => ({}));
  if (!String(code || '').trim()) return out({ success: false, message: 'Enter a code.' }, 400);
  try {
    const r = await redeem(code, email, grant);
    if (!r.ok) return out({ success: false, message: r.error }, r.status);
    const at = new Date();
    await emailOwner(`[Viral AI Clipper] Code ${r.code} redeemed by ${email}`,
`An on-site code was redeemed.

Code: ${r.code}
Redeemed by: ${email}
Reward: ${rewardText(r.reward)}${r.proUntil ? `, Pro active until ${new Date(r.proUntil).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET` : ''}${r.credits != null ? `, credits now ${r.credits}` : ''}
Time: ${at.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
    const ent = await getEntitlement(email).catch(() => ({}));
    const until = r.proUntil ? new Date(r.proUntil).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' }) : null;
    return out({
      success: true, code: r.code, reward: r.reward, proUntil: r.proUntil || null, pro: !!ent.pro, credits: ent.credits,
      message: r.reward.type === 'pro' ? `Code applied! You have Pro until ${until}. It won't renew and you won't be charged.` : `Code applied! ${r.reward.n} credits added.`,
    });
  } catch (e) {
    await reportError('code-redeem', e);
    return out({ success: false, message: 'Something went wrong applying that code. Please try again.' }, 500);
  }
}
