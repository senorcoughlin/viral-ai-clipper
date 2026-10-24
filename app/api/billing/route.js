export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getEntitlement, addCredits, setPro } from '../../../lib/billing';
import { getSession, setSessionCookie, clearSessionCookie } from '../../../lib/session';

// GET               -> entitlement for the signed-in (cookie) session
// GET ?session_id=  -> verifies a Stripe Checkout session server-side, mints the
//                      verified session cookie for its email, and records the
//                      purchase idempotently (backup for the webhook).
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session_id');
  try {
    if (sessionId) {
      if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId) || !process.env.STRIPE_SECRET_KEY) {
        return NextResponse.json({ success: false, message: 'Invalid checkout session' }, { status: 400 });
      }
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      let s;
      try { s = await stripe.checkout.sessions.retrieve(sessionId); } catch {
        return NextResponse.json({ success: false, message: 'Checkout session not found' }, { status: 404 });
      }
      const paid = s.status === 'complete' && (s.payment_status === 'paid' || s.payment_status === 'no_payment_required');
      const email = String(s.customer_details?.email || s.customer_email || '').toLowerCase();
      if (!paid || !email) {
        return NextResponse.json({ success: false, message: 'This checkout is not paid yet' }, { status: 402 });
      }
      if (s.metadata?.type === 'credits') {
        await addCredits(email, Number(s.metadata.credits) || 0, s.id);
      } else if (s.mode === 'subscription' && s.subscription) {
        try {
          const sub = await stripe.subscriptions.retrieve(String(s.subscription));
          if (['active', 'trialing'].includes(sub.status)) await setPro(email, true, s.customer);
        } catch (e) { console.warn('billing: subscription lookup failed', e?.message); }
      }
      const ent = await getEntitlement(email);
      const res = NextResponse.json({ success: true, signedIn: true, email, type: s.metadata?.type === 'credits' ? 'credits' : 'pro', purchased: Number(s.metadata?.credits) || 0, sessionId: s.id, plan: s.metadata?.plan || null, amount: typeof s.amount_total === 'number' ? s.amount_total / 100 : null, currency: String(s.currency || 'usd').toUpperCase(), ...ent });
      return setSessionCookie(res, { email, verified: true });
    }
    const sess = getSession(request);
    if (!sess) return NextResponse.json({ success: true, signedIn: false, pro: false, credits: 0 });
    const ent = sess.verified ? await getEntitlement(sess.email) : { pro: false, credits: 0 };
    return NextResponse.json({ success: true, signedIn: true, verified: sess.verified, email: sess.email, ...ent });
  } catch (e) {
    console.error('billing lookup failed', e?.message);
    return NextResponse.json({ success: false, message: 'Lookup failed' }, { status: 500 });
  }
}

// DELETE -> sign out (clears the session cookie)
export async function DELETE() {
  return clearSessionCookie(NextResponse.json({ success: true }));
}
