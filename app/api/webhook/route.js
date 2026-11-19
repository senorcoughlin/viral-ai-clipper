import { NextResponse } from 'next/server';
import { reportError, emailOwner } from '../../../lib/alerts';
import { markPro } from '../../../lib/pro';
import { addCredits, setPro, emailForCustomer } from '../../../lib/billing';
import { logPaidEntry } from '../../../lib/raffle';
import { kvEnabled, kvCommand } from '../../../lib/kv';

const etNow = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET';
const usd = (c) => `$${((Number(c) || 0) / 100).toFixed(2)}`;

// Email the owner whenever a Stripe promotion code (e.g. LAUNCH50) is redeemed at checkout. Never throws.
async function alertPromo(stripe, session, email, whenMs) {
  try {
    if (!(Number(session.total_details?.amount_discount) > 0)) return;
    if (kvEnabled && (await kvCommand(['SET', `promoalert:${session.id}`, '1', 'NX', 'EX', String(30 * 86400)])) !== 'OK') return; // Stripe retries
    const full = await stripe.checkout.sessions.retrieve(session.id, { expand: ['discounts.promotion_code', 'discounts.coupon'] });
    const codes = (full.discounts || []).map(d => {
      const pc = typeof d.promotion_code === 'object' ? d.promotion_code : null;
      const cp = (pc && pc.coupon) || (typeof d.coupon === 'object' ? d.coupon : null);
      const off = cp ? (cp.percent_off ? `${cp.percent_off}% off` : cp.amount_off ? `${usd(cp.amount_off)} off` : '') + (cp.duration ? ` (${cp.duration}${cp.duration_in_months ? `, ${cp.duration_in_months} months` : ''})` : '') : '';
      return { code: pc?.code || cp?.name || cp?.id || 'unknown', off };
    });
    const plan = session.metadata?.type === 'credits' ? `${session.metadata.credits} credits pack` : (session.metadata?.plan || 'pro_monthly');
    await emailOwner(`[Viral AI Clipper] Promo code ${codes.map(c => c.code).join(', ') || ''} redeemed by ${email}`,
`A promo code was redeemed at checkout.

Code: ${codes.map(c => c.code).join(', ') || 'unknown'}
Redeemed by: ${email}
Reward: ${codes.map(c => c.off).filter(Boolean).join('; ') || 'discount'}; ${usd(session.total_details.amount_discount)} off this payment
Purchase: ${plan}, paid ${usd(session.amount_total)}
Time: ${etNow(whenMs)}
Stripe session: ${session.id}`);
  } catch (e) { console.error('promo alert failed', e?.message); }
}

async function resolveEmail(stripe, customerId) {
  if (!customerId) return null;
  let email = await emailForCustomer(customerId);
  if (!email) {
    try { email = (await stripe.customers.retrieve(customerId))?.email; } catch {}
  }
  return email ? String(email).toLowerCase() : null;
}

export async function POST(request) {
  try {
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');
    const secret = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !webhookSecret) {
      return NextResponse.json({ error: 'Not configured' }, { status: 500 });
    }
    if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

    const stripe = require('stripe')(secret);
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed.', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Raffle entries ($1 / $4). Must run before the Pro/credits branch so a raffle payment never grants Pro.
    if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && event.data.object?.metadata?.type === 'raffle') {
      const r = await logPaidEntry(event.data.object, (event.created || 0) * 1000 || Date.now());
      console.log('Raffle entry:', event.data.object.id, r.added ? `added to ${r.month}` : (r.reason || 'duplicate'));
      return NextResponse.json({ received: true });
    }
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = (session.customer_details?.email || session.customer_email || '').toLowerCase();
      console.log('Checkout completed:', session.id, session.metadata?.type || 'subscription');
      if (!email) return NextResponse.json({ received: true });
      if (session.metadata?.type === 'credits') {
        await addCredits(email, Number(session.metadata.credits) || 0, session.id);
      } else {
        await setPro(email, true, session.customer);
        try { await markPro({ email, customerId: session.customer }); } catch (e) { console.error('legacy markPro', e); }
      }
      await alertPromo(stripe, session, email, (event.created || 0) * 1000 || Date.now());
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const email = await resolveEmail(stripe, sub.customer);
      if (email) await setPro(email, false, sub.customer);
      console.log('Subscription ended:', sub.id, email ? 'pro removed' : 'no email');
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      const email = await resolveEmail(stripe, sub.customer);
      if (email) {
        if (['active', 'trialing'].includes(sub.status)) await setPro(email, true, sub.customer);
        else if (['past_due', 'unpaid', 'canceled', 'incomplete_expired', 'paused'].includes(sub.status)) await setPro(email, false, sub.customer);
      }
      console.log('Subscription updated:', sub.id, sub.status, email ? 'applied' : 'no email');
    } else if (event.type === 'invoice.payment_failed') {
      const inv = event.data.object;
      const isSub = inv.subscription || inv.parent?.subscription_details?.subscription || inv.billing_reason?.startsWith('subscription');
      const email = isSub ? (await resolveEmail(stripe, inv.customer)) || String(inv.customer_email || '').toLowerCase() || null : null;
      if (email) await setPro(email, false, inv.customer);
      console.log('Invoice payment failed:', inv.id, email ? 'pro paused' : 'skipped');
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error(e);
    await reportError('webhook', e);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
