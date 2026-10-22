import { NextResponse } from 'next/server';

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

      // Mark as pro (in-memory for now — replace with real store)
      if (email) {
        try {
          await fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000'}/api/pro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, customerId: session.customer }),
          });
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
