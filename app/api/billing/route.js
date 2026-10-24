export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getEntitlement } from '../../../lib/billing';

// GET ?email=  -> { pro, credits }
// GET ?session_id= -> resolves the checkout email (after Stripe redirect), then entitlement
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  let email = searchParams.get('email');
  const sessionId = searchParams.get('session_id');
  try {
    if (!email && sessionId && /^cs_[A-Za-z0-9_]+$/.test(sessionId) && process.env.STRIPE_SECRET_KEY) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const s = await stripe.checkout.sessions.retrieve(sessionId);
      email = s.customer_details?.email || s.customer_email;
    }
    if (!email) return NextResponse.json({ success: false, message: 'Missing email' }, { status: 400 });
    const ent = await getEntitlement(email);
    return NextResponse.json({ success: true, email: String(email).toLowerCase(), ...ent });
  } catch (e) {
    return NextResponse.json({ success: false, message: 'Lookup failed' }, { status: 500 });
  }
}
