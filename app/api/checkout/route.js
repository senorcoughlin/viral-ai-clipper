import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const planType = body.planType || 'pro_monthly';

    // TODO: Replace with real Stripe when STRIPE_SECRET_KEY is set in Vercel
    // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    // const session = await stripe.checkout.sessions.create({ ... });

    const prices = {
      pro_monthly: 'price_monthly_placeholder',
      pro_yearly: 'price_yearly_placeholder'
    };

    return NextResponse.json({
      success: true,
      data: {
        checkoutUrl: `https://checkout.stripe.com/c/pay/${prices[planType] || 'test'}`
      }
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Checkout error' }, { status: 500 });
  }
}
