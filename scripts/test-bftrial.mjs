import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sent, db } from './fake-kv.mjs';

process.env.SESSION_SECRET = 'test-session-secret-1234567890';
process.env.RESEND_API_KEY = 'test-resend';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.STRIPE_PRICE_MONTHLY = 'price_monthly_regular';
process.env.STRIPE_PRICE_YEARLY = 'price_yearly_regular';
process.env.STRIPE_PRICE_BF_MONTHLY = 'price_bf_999';
process.env.STRIPE_PRICE_BF_YEARLY = 'price_bf_yearly_9999';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';

const {
  offerActive, offerPublic, resolveOfferCheckout, trialEndMs, BF_OFFER_END_MS,
  BF_PLAN, BF_YEARLY_PLAN, BF_TRIAL_DAYS, etDate, subGrantsPro, subRevokesPro, proPriceCopy,
} = await import('../lib/bftrial.js');
const { getEntitlement, setPro, markBfTrial, hasUsedBfTrial, listDueBfReminders, markBfReminded } = await import('../lib/billing.js');
const { signSession } = await import('../lib/session.js');
const { runCheckout } = await import('../app/api/checkout/route.js');
const { handleStripeEvent } = await import('../app/api/webhook/route.js');
const billingMod = await import('../app/api/billing/route.js');
const billingGet = billingMod.GET;
const remind = await import('../app/api/billing/trial-remind/route.js');

const prices = {
  STRIPE_PRICE_MONTHLY: 'price_monthly_regular',
  STRIPE_PRICE_YEARLY: 'price_yearly_regular',
  STRIPE_PRICE_BF_MONTHLY: 'price_bf_999',
  STRIPE_PRICE_BF_YEARLY: 'price_bf_yearly_9999',
};

const DURING = Date.parse('2026-11-22T15:00:00-05:00');
const AFTER = Date.parse('2027-01-02T00:00:00-05:00');
const LAST_MINUTE = Date.parse('2027-01-01T23:59:59-05:00');

function fakeStripe({ customers = [], subs = [], sessionSub = null } = {}) {
  const created = [];
  return {
    created,
    customers: {
      list: async ({ email }) => ({ data: customers.filter(c => !email || c.email === email) }),
    },
    subscriptions: {
      list: async ({ customer }) => ({ data: subs.filter(s => s.customer === customer) }),
      retrieve: async (id) => sessionSub && sessionSub.id === id ? sessionSub : sessionSub || { id, status: 'trialing', trial_end: Math.floor((Date.now() + 7 * 86400000) / 1000), metadata: { plan: BF_PLAN, offer: 'black_friday_2026' } },
    },
    checkout: {
      sessions: {
        create: async (args) => {
          created.push(args);
          return { url: 'https://checkout.stripe.com/c/test_bf', id: 'cs_test_bf' };
        },
      },
    },
  };
}

function checkoutReq(planType, email, { verified = true, ip = '8.8.8.8' } = {}) {
  return new Request('https://viralaiclipper.com/api/checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://viralaiclipper.com',
      'x-forwarded-for': ip + '.' + Math.floor(Math.random() * 200),
      ...(email ? { cookie: `vac_session=${encodeURIComponent(signSession({ email, verified }))}` } : {}),
    },
    body: JSON.stringify({ planType }),
  });
}

test('offer is active through the end of Jan 1, 2027 America/New_York and not after', () => {
  assert.equal(offerActive(DURING), true);
  assert.equal(offerActive(LAST_MINUTE), true);
  assert.equal(offerActive(BF_OFFER_END_MS - 1), true);
  assert.equal(offerActive(BF_OFFER_END_MS), false);
  assert.equal(offerActive(AFTER), false);
  const et = new Date(BF_OFFER_END_MS).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false });
  assert.match(et, /^1\/2\/2027, 00:00/);
  const pub = offerPublic(DURING);
  assert.equal(pub.active, true);
  assert.equal(pub.price, '$9.99');
  assert.equal(pub.yearlyPrice, '$99.99');
  assert.equal(pub.regularPrice, '$19.99');
  assert.equal(pub.regularYearlyPrice, '$199.99');
  assert.equal(pub.endsLabel, 'Jan 1, 2027');
  assert.match(pub.headline, /Black Friday deal — ends Jan 1/);
  assert.match(pub.body, /Black Friday deal — ends Jan 1/);
  assert.match(pub.body, /\$9\.99\/mo or \$99\.99\/yr/);
  assert.match(pub.disclosure, /won’t be charged today/i);
  assert.match(pub.disclosure, /\$9\.99\/month/);
  const ended = offerPublic(AFTER);
  assert.equal(ended.active, false);
  assert.equal(ended.price, '$19.99');
  assert.equal(ended.yearlyPrice, '$199.99');
  const copy = proPriceCopy(DURING);
  assert.match(copy.short, /\$9\.99\/month or \$99\.99\/year/);
  assert.equal(proPriceCopy(AFTER).short, '$19.99/month or $199.99/year');
});

test('resolveOfferCheckout: trial during the window, regular price after, sign-in required for the trial', () => {
  const trial = resolveOfferCheckout({ planType: 'pro_monthly', signedInEmail: 'a@example.com', now: DURING, prices });
  assert.equal(trial.kind, 'trial');
  assert.equal(trial.useTrial, true);
  assert.equal(trial.trialDays, BF_TRIAL_DAYS);
  assert.equal(trial.priceId, 'price_bf_999');
  assert.equal(trial.plan, BF_PLAN);

  const noAuth = resolveOfferCheckout({ planType: BF_PLAN, signedInEmail: null, now: DURING, prices });
  assert.equal(noAuth.kind, 'need_signin');

  const used = resolveOfferCheckout({ planType: 'pro_monthly', signedInEmail: 'a@example.com', usedTrial: true, now: DURING, prices });
  assert.equal(used.kind, 'sale');
  assert.equal(used.useTrial, false);
  assert.equal(used.priceId, 'price_bf_999');

  const after = resolveOfferCheckout({ planType: BF_PLAN, signedInEmail: 'a@example.com', now: AFTER, prices });
  assert.equal(after.kind, 'regular');
  assert.equal(after.useTrial, false);
  assert.equal(after.priceId, 'price_monthly_regular');
  assert.equal(after.plan, 'pro_monthly');

  const yearly = resolveOfferCheckout({ planType: 'pro_yearly', signedInEmail: null, now: DURING, prices });
  assert.equal(yearly.kind, 'sale');
  assert.equal(yearly.plan, BF_YEARLY_PLAN);
  assert.equal(yearly.useTrial, false);
  assert.equal(yearly.priceId, 'price_bf_yearly_9999');

  const yearlyAfter = resolveOfferCheckout({ planType: 'pro_yearly', signedInEmail: null, now: AFTER, prices });
  assert.equal(yearlyAfter.kind, 'regular');
  assert.equal(yearlyAfter.plan, 'pro_yearly');
  assert.equal(yearlyAfter.priceId, 'price_yearly_regular');

  const missing = resolveOfferCheckout({ planType: 'pro_monthly', signedInEmail: 'a@example.com', now: DURING, prices: { ...prices, STRIPE_PRICE_BF_MONTHLY: '' } });
  assert.equal(missing.kind, 'regular');
  assert.equal(missing.priceId, 'price_monthly_regular');

  const missingYearly = resolveOfferCheckout({ planType: 'pro_yearly', signedInEmail: null, now: DURING, prices: { ...prices, STRIPE_PRICE_BF_YEARLY: '' } });
  assert.equal(missingYearly.kind, 'regular');
  assert.equal(missingYearly.priceId, 'price_yearly_regular');
});

test('checkout creates a subscription session with a 7-day trial and always collects a card', async () => {
  const stripe = fakeStripe();
  const res = await runCheckout(checkoutReq('pro_monthly', 'trialer@example.com'), stripe);
  const d = await res.json();
  assert.equal(res.status, 200, JSON.stringify(d));
  assert.equal(d.success, true);
  assert.equal(d.trial, true);
  assert.equal(stripe.created.length, 1);
  const s = stripe.created[0];
  assert.equal(s.mode, 'subscription');
  assert.equal(s.line_items[0].price, 'price_bf_999');
  assert.equal(s.payment_method_collection, 'always');
  assert.equal(s.subscription_data.trial_period_days, 7);
  assert.equal(s.metadata.plan, BF_PLAN);
  assert.equal(s.metadata.offer, 'black_friday_2026');
  assert.equal(s.customer_email, 'trialer@example.com');
  assert.equal(s.allow_promotion_codes, false);
});

test('checkout requires a signed-in account for the trial and does not create a session', async () => {
  const stripe = fakeStripe();
  const res = await runCheckout(checkoutReq(BF_PLAN, null), stripe);
  const d = await res.json();
  assert.equal(res.status, 401);
  assert.equal(d.code, 'need_signin');
  assert.equal(stripe.created.length, 0);
});

test('checkout blocks a second trial for the same account and falls back to the sale price without a trial', async () => {
  await markBfTrial('repeat@example.com', { customerId: 'cus_repeat', trialEnd: Date.now() + 86400000 });
  assert.equal(await hasUsedBfTrial('repeat@example.com'), true);
  const stripe = fakeStripe();
  const res = await runCheckout(checkoutReq(BF_PLAN, 'repeat@example.com'), stripe);
  const d = await res.json();
  assert.equal(res.status, 200, JSON.stringify(d));
  assert.equal(d.trial, false);
  assert.equal(stripe.created[0].line_items[0].price, 'price_bf_999');
  assert.equal(stripe.created[0].payment_method_collection, undefined);
  assert.ok(!stripe.created[0].subscription_data.trial_period_days);
});

test('checkout blocks a new trial when Stripe already has an active subscription for the customer', async () => {
  const stripe = fakeStripe({
    customers: [{ id: 'cus_active', email: 'paid@example.com' }],
    subs: [{ id: 'sub_active', customer: 'cus_active', status: 'active' }],
  });
  const res = await runCheckout(checkoutReq(BF_PLAN, 'paid@example.com'), stripe);
  assert.equal(res.status, 409);
  assert.equal(stripe.created.length, 0);
});

test('webhook: trialing checkout grants Pro and records the trial; cancel, past_due, and payment failure remove it', async () => {
  const email = 'hook@example.com';
  const trialEnd = Math.floor((Date.now() + 7 * 86400000) / 1000);
  const stripe = fakeStripe({
    sessionSub: {
      id: 'sub_trial',
      status: 'trialing',
      trial_end: trialEnd,
      metadata: { plan: BF_PLAN, offer: 'black_friday_2026', email },
    },
  });

  const completed = {
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    data: { object: {
      id: 'cs_trial',
      customer: 'cus_hook',
      customer_details: { email },
      subscription: 'sub_trial',
      metadata: { plan: BF_PLAN, offer: 'black_friday_2026', trial: '1' },
    } },
  };
  await handleStripeEvent(completed, stripe);
  let ent = await getEntitlement(email);
  assert.equal(ent.pro, true);
  assert.equal(ent.bfTrialUsed, true);
  assert.ok(ent.trialEnd && ent.trialEnd > Date.now());
  assert.equal(await hasUsedBfTrial(email, 'cus_hook'), true);

  await handleStripeEvent({ type: 'customer.subscription.updated', data: { object: { id: 'sub_trial', customer: 'cus_hook', status: 'past_due', metadata: { email } } } }, stripe);
  assert.equal((await getEntitlement(email)).pro, false);

  await handleStripeEvent({ type: 'customer.subscription.updated', data: { object: { id: 'sub_trial', customer: 'cus_hook', status: 'trialing', trial_end: trialEnd, metadata: { email, plan: BF_PLAN } } } }, stripe);
  assert.equal((await getEntitlement(email)).pro, true);

  await handleStripeEvent({ type: 'invoice.payment_failed', data: { object: { id: 'in_fail', customer: 'cus_hook', customer_email: email, subscription: 'sub_trial', billing_reason: 'subscription_cycle' } } }, stripe);
  assert.equal((await getEntitlement(email)).pro, false);

  await setPro(email, true, 'cus_hook');
  await handleStripeEvent({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_trial', customer: 'cus_hook' } } }, stripe);
  assert.equal((await getEntitlement(email)).pro, false);
  // The used-trial flag must survive cancel so they cannot start another trial.
  assert.equal(await hasUsedBfTrial(email), true);
});

test('billing GET advertises the offer and requires sign-in while it is running', async () => {
  const anon = await billingGet(new Request('https://viralaiclipper.com/api/billing'));
  const a = await anon.json();
  assert.equal(a.success, true);
  assert.equal(a.signedIn, false);
  assert.equal(a.offer.active, offerActive());
  if (a.offer.active) assert.equal(a.offer.reason, 'signin');

  const req = new Request('https://viralaiclipper.com/api/billing', {
    headers: { cookie: `vac_session=${encodeURIComponent(signSession({ email: 'fresh@example.com', verified: false }))}` },
  });
  const b = await (await billingGet(req)).json();
  assert.equal(b.signedIn, true);
  assert.equal(b.pro, false);
  if (b.offer.active) {
    assert.equal(b.offer.eligible, true);
    assert.match(b.offer.body, /Black Friday deal — ends Jan 1/);
    assert.match(b.offer.body, /\$9\.99\/mo or \$99\.99\/yr/);
  }
});

test('trial reminder emails go to the customer, not the owner, in the 48-hour window', async () => {
  sent.length = 0;
  const email = 'remind-me@example.com';
  const soon = Date.now() + 36 * 3600 * 1000;
  await markBfTrial(email, { customerId: 'cus_rem', trialEnd: soon });
  const due = await listDueBfReminders();
  assert.ok(due.some(d => d.email === email));

  const later = Date.now() + 5 * 86400000;
  await markBfTrial('later@example.com', { customerId: 'cus_later', trialEnd: later });
  const due2 = await listDueBfReminders();
  assert.ok(!due2.some(d => d.email === 'later@example.com'));

  const forbidden = await remind.GET(new Request('https://viralaiclipper.com/api/billing/trial-remind'));
  assert.equal(forbidden.status, 403);

  const ok = await remind.GET(new Request('https://viralaiclipper.com/api/billing/trial-remind', {
    headers: { authorization: 'Bearer test-cron-secret' },
  }));
  const d = await ok.json();
  assert.equal(ok.status, 200, JSON.stringify(d));
  assert.ok(d.sent >= 1);
  const mail = sent.find(s => s.to?.[0] === email);
  assert.ok(mail, 'customer reminder not sent');
  assert.match(mail.subject, /free Pro week ends/i);
  assert.match(mail.text, /\$9\.99\/month/);
  assert.ok(!sent.some(s => (s.to || []).includes('senorcoughlin@gmail.com') && s.subject.includes('free Pro week')));

  const due3 = await listDueBfReminders();
  assert.ok(!due3.some(d => d.email === email));
});

test('subGrantsPro treats trialing as Pro and subRevokesPro covers cancel and past_due', () => {
  assert.equal(subGrantsPro('trialing'), true);
  assert.equal(subGrantsPro('active'), true);
  assert.equal(subRevokesPro('canceled'), true);
  assert.equal(subRevokesPro('past_due'), true);
  assert.equal(subRevokesPro('unpaid'), true);
  assert.equal(subGrantsPro('incomplete'), false);
});

test('trialEndMs is 7 days later', () => {
  const from = Date.parse('2026-11-22T12:00:00-05:00');
  assert.equal(trialEndMs(from) - from, 7 * 86400000);
  assert.match(etDate(from), /November 22, 2026/);
});

test('checkout falls back to regular $19.99 / $199.99 pricing after the Jan 1, 2027 cutoff', async () => {
  const stripe = fakeStripe();
  const after = Date.parse('2027-01-02T00:00:00-05:00');
  const res = await runCheckout(checkoutReq('pro_monthly', 'late@example.com'), stripe, after);
  const d = await res.json();
  assert.equal(res.status, 200, JSON.stringify(d));
  assert.equal(d.trial, false);
  assert.equal(d.plan, 'pro_monthly');
  assert.equal(stripe.created[0].line_items[0].price, 'price_monthly_regular');
  assert.ok(!stripe.created[0].subscription_data.trial_period_days);
  assert.notEqual(stripe.created[0].payment_method_collection, 'always');

  const stripe2 = fakeStripe();
  const res2 = await runCheckout(checkoutReq('pro_monthly', null), stripe2, after);
  const d2 = await res2.json();
  assert.equal(res2.status, 200, JSON.stringify(d2));
  assert.equal(d2.trial, false);
  assert.equal(stripe2.created[0].line_items[0].price, 'price_monthly_regular');

  const stripe3 = fakeStripe();
  const res3 = await runCheckout(checkoutReq('pro_yearly', 'late@example.com'), stripe3, after);
  const d3 = await res3.json();
  assert.equal(res3.status, 200, JSON.stringify(d3));
  assert.equal(d3.plan, 'pro_yearly');
  assert.equal(stripe3.created[0].line_items[0].price, 'price_yearly_regular');
});

test('checkout uses the $99.99 yearly sale price during the offer and does not start a trial', async () => {
  const stripe = fakeStripe();
  const res = await runCheckout(checkoutReq('pro_yearly', 'year@example.com'), stripe, DURING);
  const d = await res.json();
  assert.equal(res.status, 200, JSON.stringify(d));
  assert.equal(d.trial, false);
  assert.equal(d.plan, BF_YEARLY_PLAN);
  assert.equal(stripe.created[0].line_items[0].price, 'price_bf_yearly_9999');
  assert.ok(!stripe.created[0].subscription_data.trial_period_days);
  assert.notEqual(stripe.created[0].payment_method_collection, 'always');
});
