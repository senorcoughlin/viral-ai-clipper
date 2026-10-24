import { NextResponse } from 'next/server';
import { markPro, isProEmail } from '../../../lib/pro';
import { paidEmail } from '../../../lib/session';

// Marking someone Pro is only allowed from trusted server code (the Stripe webhook
// now calls lib/pro directly). External callers must present the internal key.
export async function POST(request) {
  const key = process.env.PRO_ADMIN_KEY || process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || request.headers.get('x-internal-key') !== key) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }
  const { email, customerId } = await request.json().catch(() => ({}));
  const count = await markPro({ email, customerId });
  return NextResponse.json({ success: true, count });
}

// Pro status for the signed-in session only; no lookups by arbitrary email.
export async function GET(request) {
  const email = paidEmail(request);
  const isPro = email ? await isProEmail(email) : false;
  return NextResponse.json({ isPro });
}
