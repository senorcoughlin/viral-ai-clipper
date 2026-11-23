// Black Friday 2026: Pro at $9.99/month or $99.99/year, through the end of Jan 1, 2027 ET.
// Monthly still includes a card-required 7-day free Pro trial. After the cutoff,
// copy and checkout automatically fall back to regular $19.99/mo and $199.99/yr.
// Pure helpers only — no Stripe, Redis, or secrets — safe to import from client components.

export const BF_TRIAL_DAYS = 7;
export const BF_MONTHLY_CENTS = 999;
export const BF_YEARLY_CENTS = 9999;
export const REGULAR_MONTHLY_CENTS = 1999;
export const REGULAR_YEARLY_CENTS = 19999;
export const BF_PLAN = 'pro_bf_monthly';
export const BF_YEARLY_PLAN = 'pro_bf_yearly';
export const BF_OFFER = 'black_friday_2026';
// First instant after Jan 1, 2027 23:59 America/New_York (EST, UTC-5).
export const BF_OFFER_END_MS = Date.parse('2027-01-02T05:00:00.000Z');

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
    price: active ? '$9.99' : '$19.99',
    yearlyPrice: active ? '$99.99' : '$199.99',
    priceCents: active ? BF_MONTHLY_CENTS : REGULAR_MONTHLY_CENTS,
    yearlyPriceCents: active ? BF_YEARLY_CENTS : REGULAR_YEARLY_CENTS,
    regularPrice: '$19.99',
    regularYearlyPrice: '$199.99',
    yearlyPer: active ? '/yr · about $8.33/mo' : '/yr · about $16.67/mo',
    yearlySavings: active ? 'save 50%' : 'save 17%',
    endsAt: BF_OFFER_END_MS,
    endsLabel: 'Jan 1, 2027',
    endsShort: 'ends Jan 1',
    trialEndAt: trialEnd,
    trialEndLabel: etDate(trialEnd),
    headline: 'Black Friday deal — ends Jan 1',
    body: 'Black Friday deal — ends Jan 1. Pro is $9.99/mo or $99.99/yr. 7 days free on monthly, cancel anytime.',
    disclosure: `You won’t be charged today. Your free Pro trial ends on ${etDate(trialEnd)} (America/New_York). Then you’ll be billed $9.99/month until you cancel.`,
    yearlyDisclosure: 'Billed $99.99 today for a year of Pro (regularly $199.99). Offer ends Jan 1, 2027. Cancel anytime.',
  };
}

// Date-gated marketing sentences for guides, SEO and FAQ. After the cutoff these
// automatically return regular $19.99 / $199.99 wording.
export function proPriceCopy(now = Date.now()) {
  const o = offerPublic(now);
  if (o.active) {
    return {
      monthly: '$9.99/month',
      yearly: '$99.99/year',
      both: '$9.99 a month or $99.99 a year',
      short: '$9.99/month or $99.99/year',
      deal: 'Black Friday deal — ends Jan 1: $9.99/month or $99.99/year (regularly $19.99/mo or $199.99/yr)',
      sentence: 'Pro is $9.99 a month or $99.99 a year during the Black Friday deal (ends Jan 1; regularly $19.99/mo or $199.99/yr)',
    };
  }
  return {
    monthly: '$19.99/month',
    yearly: '$199.99/year',
    both: '$19.99 a month or $199.99 a year',
    short: '$19.99/month or $199.99/year',
    deal: '$19.99 a month or $199.99 a year',
    sentence: 'Pro is $19.99 a month or $199.99 a year',
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
  const yearly = planType === 'pro_yearly' || planType === BF_YEARLY_PLAN;
  const monthly = planType === 'pro_monthly' || planType === BF_PLAN || !planType;
  const offerOn = offerActive(now);

  if (yearly) {
    const bfYearly = prices.STRIPE_PRICE_BF_YEARLY || null;
    if (offerOn && bfYearly) {
      return {
        kind: 'sale',
        plan: BF_YEARLY_PLAN,
        priceEnv: 'STRIPE_PRICE_BF_YEARLY',
        priceId: bfYearly,
        useTrial: false,
        trialDays: 0,
      };
    }
    return {
      kind: 'regular',
      plan: 'pro_yearly',
      priceEnv: 'STRIPE_PRICE_YEARLY',
      priceId: prices.STRIPE_PRICE_YEARLY || null,
      useTrial: false,
      trialDays: 0,
      fallback: offerOn ? 'missing_price' : undefined,
    };
  }

  if (!monthly) {
    return { kind: 'unknown', plan: planType, useTrial: false, trialDays: 0 };
  }

  if (!offerOn) {
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
