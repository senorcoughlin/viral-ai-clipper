import { NextResponse } from 'next/server';
import { reportError } from '../../../../lib/alerts';
import { routeGuard } from '../../../../lib/ratelimit';
import { PACKS, DESCRIPTION, cleanName, cleanEmail, validEmail, raffleMonth, monthLabel } from '../../../../lib/raffle';

// Creates a Stripe Checkout Session for $1 (1 entry) or $4 (5 entries). Entries are logged by /api/webhook.
export async function POST(request) {
  const limited = await routeGuard(request, 'raffle-checkout', 20, 3600);
  if (limited) return limited;
  try {
    const body = await request.json().catch(() => ({}));
    const pack = PACKS[body.pack];
    const name = cleanName(body.name);
    const email = cleanEmail(body.email);
    if (!pack) return NextResponse.json({ error: 'Pick 1 entry or 5 entries.' }, { status: 400 });
    if (name.length < 2) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
    if (!validEmail(email)) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    if (body.agree !== true) return NextResponse.json({ error: 'Please confirm you are 18+ and agree to the Official Rules.' }, { status: 400 });

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) return NextResponse.json({ error: 'Payments are not configured.' }, { status: 500 });
    const stripe = require('stripe')(secret);
    const origin = request.headers.get('origin') || 'https://viralaiclipper.com';
    const month = raffleMonth();
    const metadata = {
      type: 'raffle',
      raffle_month: month,
      raffle_pack: body.pack,
      raffle_votes: String(pack.votes),
      raffle_name: name,
      raffle_email: email,
    };
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: pack.cents,
          product_data: {
            name: `Monthly raffle: ${pack.label} (win 1 month of Pro)`,
            description: `${monthLabel(month)} drawing · Viral AI Clipper. Not a charitable donation.`,
          },
        },
      }],
      customer_email: email,
      customer_creation: 'if_required',
      submit_type: 'pay',
      success_url: `${origin}/raffle?entered=paid&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/raffle?entered=cancel`,
      metadata,
      payment_intent_data: { description: DESCRIPTION, metadata },
      managed_payments: { enabled: false },
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error(error);
    await reportError('raffle-checkout', error);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}
