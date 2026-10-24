'use client';
// Google Ads + Vercel Analytics conversion helpers. Every call is a no-op when
// the matching NEXT_PUBLIC_GADS_* env var is unset.
import { track } from '@vercel/analytics';

export const GADS_ID = process.env.NEXT_PUBLIC_GADS_ID || '';
const LABELS = {
  sign_up: process.env.NEXT_PUBLIC_GADS_SIGNUP_LABEL || '',
  begin_checkout: process.env.NEXT_PUBLIC_GADS_CHECKOUT_LABEL || '',
  purchase: process.env.NEXT_PUBLIC_GADS_PURCHASE_LABEL || '',
};
export const PLAN_VALUES = { pro_monthly: 19.99, pro_yearly: 199.99, credits_10: 9, credits_25: 19, credits_50: 29, credits_100: 49 };

export function trackConversion(event, params = {}) {
  if (typeof window === 'undefined') return;
  try {
    const props = {};
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') props[k] = typeof v === 'number' ? v : String(v);
    track(event, props);
  } catch {}
  try {
    if (!GADS_ID || typeof window.gtag !== 'function') return;
    window.gtag('event', event, params);
    const label = LABELS[event];
    if (label) {
      const conv = { send_to: `${GADS_ID}/${label}` };
      if (event === 'purchase') { if (params.value != null) { conv.value = params.value; conv.currency = params.currency || 'USD'; } }
      else { conv.value = 0; conv.currency = 'USD'; } // micro-conversions: no value so they don't inflate
      if (params.transaction_id) conv.transaction_id = params.transaction_id;
      window.gtag('event', 'conversion', conv);
    }
  } catch {}
}
