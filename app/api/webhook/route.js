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
      // For now we just log. Later you can store customer/email → pro status in a DB.
      console.log('Payment succeeded for session:', session.id, session.customer_email);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
