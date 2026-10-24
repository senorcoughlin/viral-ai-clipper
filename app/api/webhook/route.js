import { NextResponse } from 'next/server';
import { reportError } from '../../../lib/alerts';
import { markPro } from '../../../lib/pro';
import { addCredits, setPro, emailForCustomer } from '../../../lib/billing';

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
