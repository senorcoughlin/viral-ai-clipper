import { NextResponse } from 'next/server';
import { markPro } from '../../../lib/pro';
import { addCredits, setPro, emailForCustomer } from '../../../lib/billing';

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
      let email = await emailForCustomer(sub.customer);
      if (!email && sub.customer) {
        try { email = (await stripe.customers.retrieve(sub.customer))?.email; } catch {}
      }
      if (email) await setPro(email, false, sub.customer);
      console.log('Subscription ended:', sub.id, email ? 'pro removed' : 'no email');
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
