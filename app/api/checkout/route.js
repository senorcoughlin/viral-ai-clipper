import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const planType = body.planType || 'pro_monthly';

    const secret = process.env.STRIPE_SECRET_KEY;
    const priceId = planType === 'pro_yearly'
      ? process.env.STRIPE_PRICE_YEARLY
      : process.env.STRIPE_PRICE_MONTHLY;

    if (!secret || !priceId) {
      return NextResponse.json({ success: false, message: 'Stripe not configured' }, { status: 500 });
    }

    const stripe = require('stripe')(secret);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${request.headers.get('origin') || 'https://viral-ai-clipper-lovat.vercel.app'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.headers.get('origin') || 'https://viral-ai-clipper-lovat.vercel.app'}/cancel`,
    });

    return NextResponse.json({
      success: true,
      data: { checkoutUrl: session.url }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: error.message || 'Checkout error' }, { status: 500 });
  }
}
