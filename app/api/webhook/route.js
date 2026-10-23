import { NextResponse } from 'next/server';
import { markPro } from '../../../lib/pro';

export async function POST(request) {
  try {
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');
    const secret = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!secret || !webhookSecret) {
      return NextResponse.json({ error: 'Not configured' }, { status: 500 });
    }

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
      const email = session.customer_details?.email || session.customer_email;
      console.log('Payment succeeded:', session.id, email);

      // Mark as pro in the Blob-backed list (credit packs are not Pro).
      if (email && session.metadata?.type !== 'credits') {
        try {
          await markPro({ email, customerId: session.customer });
        } catch (e) {
          console.error('Failed to mark pro:', e);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
