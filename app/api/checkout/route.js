import { NextResponse } from 'next/server';

const CREDIT_PACKS = {
  credits_10: { priceEnv: 'STRIPE_PRICE_CREDITS_10', credits: 10, mode: 'payment' },
  credits_25: { priceEnv: 'STRIPE_PRICE_CREDITS_25', credits: 25, mode: 'payment' },
  credits_50: { priceEnv: 'STRIPE_PRICE_CREDITS_50', credits: 50, mode: 'payment' },
  credits_100: { priceEnv: 'STRIPE_PRICE_CREDITS_100', credits: 100, mode: 'payment' },
};

export async function POST(request) {
  try {
    const body = await request.json();
    const planType = body.planType || 'pro_monthly';

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ success: false, message: 'Stripe not configured' }, { status: 500 });
    }

    const stripe = require('stripe')(secret);
    const origin = request.headers.get('origin') || 'https://viralaiclipper.com';

    // One-time credit packs
    if (CREDIT_PACKS[planType]) {
      const pack = CREDIT_PACKS[planType];
      const priceId = process.env[pack.priceEnv];
      if (!priceId) {
        return NextResponse.json({ success: false, message: 'Credit price not configured' }, { status: 500 });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}&type=credits`,
        cancel_url: `${origin}/cancel`,
        metadata: { type: 'credits', credits: String(pack.credits) },
        managed_payments: { enabled: false },
      });

      return NextResponse.json({ success: true, data: { checkoutUrl: session.url } });
    }

    // Subscriptions
    const priceId = planType === 'pro_yearly'
      ? process.env.STRIPE_PRICE_YEARLY
      : process.env.STRIPE_PRICE_MONTHLY;

    if (!priceId) {
      return NextResponse.json({ success: false, message: 'Subscription price not configured' }, { status: 500 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel`,
      managed_payments: { enabled: false },
    });

    return NextResponse.json({ success: true, data: { checkoutUrl: session.url } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: error.message || 'Checkout error' }, { status: 500 });
  }
}
