import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const planType = body.planType || 'pro_monthly';

    // Stub: replace with real Stripe Checkout Session later
    return NextResponse.json({
      success: true,
      data: {
        checkoutUrl: `https://buy.stripe.com/test_${planType}`
      }
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Checkout error' }, { status: 500 });
  }
}
