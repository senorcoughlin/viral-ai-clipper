// Black Friday 2026: 7-day free Pro trial, then $9.99/month, until end of Dec 7, 2026 ET.
// Pure helpers only — no Stripe, Redis, or secrets — safe to import from client components.

export const BF_TRIAL_DAYS = 7;
export const BF_MONTHLY_CENTS = 999;
export const BF_PLAN = 'pro_bf_monthly';
export const BF_OFFER = 'black_friday_2026';
// First instant after Dec 7, 2026 in America/New_York (EST, UTC-5).
export const BF_OFFER_END_MS = Date.parse('2026-12-08T05:00:00.000Z');

export function offerActive(now = Date.now()) {
  return Number(now) < BF_OFFER_END_MS;
}

export function etDate(ms, extra = {}) {
  return new Date(ms).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...extra,
  });
}

export function trialEndMs(from = Date.now()) {
  return Number(from) + BF_TRIAL_DAYS * 86400000;
}

export function offerPublic(now = Date.now()) {
  const active = offerActive(now);
  const trialEnd = trialEndMs(now);
  return {
    active,
    trialDays: BF_TRIAL_DAYS,
    price: '$9.99',
    priceCents: BF_MONTHLY_CENTS,
    regularPrice: '$19.99',
    endsAt: BF_OFFER_END_MS,
    endsLabel: 'December 7, 2026',
    trialEndAt: trialEnd,
    trialEndLabel: etDate(trialEnd),
    headline: 'Black Friday: 7 days of Pro free',
    body: '7 days free, then $9.99/mo, cancel anytime. Offer ends Dec 7.',
    disclosure: `You won’t be charged today. Your free Pro trial ends on ${etDate(trialEnd)} (America/New_York). Then you’ll be billed $9.99/month until you cancel.`,
  };
}

// Pure checkout decision. prices is a map of env name -> price id.
export function resolveOfferCheckout({
  planType = 'pro_monthly',
  signedInEmail = null,
  usedTrial = false,
  hasActiveSub = false,
  now = Date.now(),
  prices = {},
} = {}) {
  const yearly = planType === 'pro_yearly';
  const monthly = planType === 'pro_monthly' || planType === BF_PLAN || !planType;
  const offerOn = offerActive(now);
  const wantTrial = monthly && offerOn && planType !== 'pro_yearly';

  if (yearly) {
    return {
      kind: 'regular',
      plan: 'pro_yearly',
      priceEnv: 'STRIPE_PRICE_YEARLY',
      priceId: prices.STRIPE_PRICE_YEARLY || null,
      useTrial: false,
      trialDays: 0,
    };
  }

  if (!monthly) {
    return { kind: 'unknown', plan: planType, useTrial: false, trialDays: 0 };
  }

  if (!wantTrial) {
    return {
      kind: 'regular',
      plan: 'pro_monthly',
      priceEnv: 'STRIPE_PRICE_MONTHLY',
      priceId: prices.STRIPE_PRICE_MONTHLY || null,
      useTrial: false,
      trialDays: 0,
    };
  }

  const bfPrice = prices.STRIPE_PRICE_BF_MONTHLY || null;
  if (!bfPrice) {
    return {
      kind: 'regular',
      plan: 'pro_monthly',
      priceEnv: 'STRIPE_PRICE_MONTHLY',
      priceId: prices.STRIPE_PRICE_MONTHLY || null,
      useTrial: false,
      trialDays: 0,
      fallback: 'missing_price',
    };
  }

  if (!signedInEmail) {
    return {
      kind: 'need_signin',
      message: 'Sign in or create an account to start your 7-day free Pro trial.',
      plan: BF_PLAN,
      useTrial: false,
      trialDays: BF_TRIAL_DAYS,
    };
  }

  if (hasActiveSub) {
    return {
      kind: 'already_subscribed',
      message: 'This account already has a Pro subscription.',
      plan: BF_PLAN,
      useTrial: false,
      trialDays: 0,
    };
  }

  // Already used the trial: still offer the $9.99 sale price, but no second trial.
  return {
    kind: usedTrial ? 'sale' : 'trial',
    plan: BF_PLAN,
    priceEnv: 'STRIPE_PRICE_BF_MONTHLY',
    priceId: bfPrice,
    useTrial: !usedTrial,
    trialDays: usedTrial ? 0 : BF_TRIAL_DAYS,
    email: signedInEmail,
    message: usedTrial
      ? 'You already used the free trial. You can still get Pro at $9.99/month during this offer.'
      : null,
  };
}

export const PRO_SUB_STATUSES = ['active', 'trialing'];
export const LOST_SUB_STATUSES = ['past_due', 'unpaid', 'canceled', 'incomplete_expired', 'paused'];

export function subGrantsPro(status) {
  return PRO_SUB_STATUSES.includes(status);
}

export function subRevokesPro(status) {
  return LOST_SUB_STATUSES.includes(status);
}
