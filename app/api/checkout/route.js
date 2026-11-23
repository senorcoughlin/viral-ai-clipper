import { NextResponse } from 'next/server';
import { reportError } from '../../../lib/alerts';
import { routeGuard } from '../../../lib/ratelimit';
import { getSession } from '../../../lib/session';
import { hasUsedBfTrial } from '../../../lib/billing';
import { resolveOfferCheckout, BF_PLAN, BF_OFFER, BF_TRIAL_DAYS, offerPublic } from '../../../lib/bftrial';

const CREDIT_PACKS = {
  credits_10: { priceEnv: 'STRIPE_PRICE_CREDITS_10', credits: 10, mode: 'payment' },
  credits_25: { priceEnv: 'STRIPE_PRICE_CREDITS_25', credits: 25, mode: 'payment' },
  credits_50: { priceEnv: 'STRIPE_PRICE_CREDITS_50', credits: 50, mode: 'payment' },
  credits_100: { priceEnv: 'STRIPE_PRICE_CREDITS_100', credits: 100, mode: 'payment' },
};

function priceEnv() {
  return {
    STRIPE_PRICE_MONTHLY: process.env.STRIPE_PRICE_MONTHLY,
    STRIPE_PRICE_YEARLY: process.env.STRIPE_PRICE_YEARLY,
    STRIPE_PRICE_BF_MONTHLY: process.env.STRIPE_PRICE_BF_MONTHLY,
    STRIPE_PRICE_BF_YEARLY: process.env.STRIPE_PRICE_BF_YEARLY,
  };
}

// gclid/utm captured on landing (components/GoogleAds.jsx) -> Stripe metadata for attribution.
function readAttribution(request) {
  const out = {};
  try {
    const raw = request.cookies.get('vac_attr')?.value;
    if (!raw) return out;
    const a = JSON.parse(decodeURIComponent(raw));
    for (const k of ['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'landing']) {
      if (a[k]) out[k] = String(a[k]).slice(0, 200);
    }
  } catch {}
  return out;
}

async function findCustomerAndSubs(stripe, email) {
  const out = { customer: null, hasActiveSub: false, usedTrialOnCustomer: false };
  if (!stripe?.customers?.list || !email) return out;
  try {
    const list = await stripe.customers.list({ email, limit: 10 });
    for (const c of list.data || []) {
      if (!out.customer) out.customer = c;
      if (!stripe.subscriptions?.list) continue;
      const subs = await stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 100 });
      for (const s of subs.data || []) {
        if (['active', 'trialing', 'past_due', 'unpaid', 'paused'].includes(s.status)) out.hasActiveSub = true;
        if (s.trial_start || s.metadata?.offer === BF_OFFER || s.metadata?.plan === BF_PLAN) out.usedTrialOnCustomer = true;
      }
    }
  } catch (e) { console.warn('checkout: customer lookup failed', e?.message); }
  return out;
}

export async function runCheckout(request, stripe, now = Date.now()) {
  const limited = await routeGuard(request, 'checkout', 30, 3600);
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const planType = body.planType || 'pro_monthly';
  const attr = readAttribution(request);
  const origin = request.headers.get('origin') || 'https://viralaiclipper.com';
  const sess = getSession(request);
  const signedInEmail = sess?.email || null;

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
      metadata: { type: 'credits', credits: String(pack.credits), plan: planType, ...attr },
      managed_payments: { enabled: false },
    });
    return NextResponse.json({ success: true, data: { checkoutUrl: session.url } });
  }

  const { customer, hasActiveSub, usedTrialOnCustomer } = (planType === 'pro_yearly' || CREDIT_PACKS[planType])
    ? { customer: null, hasActiveSub: false, usedTrialOnCustomer: false }
    : await findCustomerAndSubs(stripe, signedInEmail);

  const usedTrial = !!(signedInEmail && (await hasUsedBfTrial(signedInEmail, customer?.id))) || usedTrialOnCustomer;
  const decision = resolveOfferCheckout({
    planType,
    signedInEmail,
    usedTrial,
    hasActiveSub,
    now,
    prices: priceEnv(),
  });

  if (decision.kind === 'need_signin') {
    return NextResponse.json({ success: false, code: 'need_signin', message: decision.message, offer: offerPublic() }, { status: 401 });
  }
  if (decision.kind === 'already_subscribed') {
    return NextResponse.json({ success: false, code: 'already_subscribed', message: decision.message }, { status: 409 });
  }
  if (decision.kind === 'unknown') {
    return NextResponse.json({ success: false, message: 'Unknown plan' }, { status: 400 });
  }

  const priceId = decision.priceId;
  if (!priceId) {
    return NextResponse.json({ success: false, message: 'Subscription price not configured' }, { status: 500 });
  }

  const params = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/cancel`,
    metadata: { plan: decision.plan, ...attr },
    subscription_data: { metadata: { plan: decision.plan, ...attr } },
    allow_promotion_codes: decision.useTrial ? false : true,
    managed_payments: { enabled: false },
  };

  if (decision.useTrial) {
    params.payment_method_collection = 'always';
    params.subscription_data.trial_period_days = BF_TRIAL_DAYS;
    params.metadata.offer = BF_OFFER;
    params.metadata.trial = '1';
    params.subscription_data.metadata.offer = BF_OFFER;
    params.subscription_data.metadata.trial = '1';
    if (signedInEmail) {
      params.metadata.email = signedInEmail;
      params.subscription_data.metadata.email = signedInEmail;
    }
  }

  if (customer?.id) params.customer = customer.id;
  else if (signedInEmail) params.customer_email = signedInEmail;

  const session = await stripe.checkout.sessions.create(params);
  return NextResponse.json({
    success: true,
    data: { checkoutUrl: session.url },
    offer: offerPublic(),
    trial: !!decision.useTrial,
    plan: decision.plan,
    message: decision.message || undefined,
  });
}

export async function POST(request) {
  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ success: false, message: 'Stripe not configured' }, { status: 500 });
    }
    const stripe = require('stripe')(secret);
    return await runCheckout(request, stripe);
  } catch (error) {
    console.error(error);
    await reportError('checkout', error);
    return NextResponse.json({ success: false, message: error.message || 'Checkout error' }, { status: 500 });
  }
}
