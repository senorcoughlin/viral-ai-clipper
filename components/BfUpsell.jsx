'use client';
import BfCountdown from './BfCountdown';
import { funnel } from '../lib/funnel';
import { LIMIT_COPY } from '../lib/limits';

const COPY = {
  after_clips: {
    title: 'Nice clips. Go Pro while it’s 50% off.',
    body: `200 generations a day, no watermark, and the full ${LIMIT_COPY.max} window. $9.99/mo (7 days free) or $99.99/yr — regularly $19.99/$199.99.`,
    cta: 'Get the Black Friday deal',
  },
  windowed: {
    title: `Pro clips the full ${LIMIT_COPY.max}`,
    body: `Free runs use the first ${LIMIT_COPY.freeWindow}. Black Friday Pro is $9.99/mo (7 days free) or $99.99/yr, 50% off.`,
    cta: 'Upgrade at 50% off',
  },
  limit: {
    title: 'Out of free generations?',
    body: 'Pro is 200 a day. Black Friday: $9.99/mo with a 7-day free trial, or $99.99/yr (50% off).',
    cta: 'Get Pro at 50% off',
  },
  studio: {
    title: 'Black Friday: 50% off Pro',
    body: `$9.99/mo (7 days free) or $99.99/yr. Unlock Pro editing, no watermark, and the full ${LIMIT_COPY.max} window.`,
    cta: 'See the deal',
  },
};

// Compact, date-gated upsell. Renders nothing after the deal ends or for Pro users.
export default function BfUpsell({ offer, isPro, context = 'after_clips', onCta, compact = false }) {
  if (!offer?.active || isPro) return null;
  const c = COPY[context] || COPY.after_clips;
  const go = () => {
    funnel('bf_upsell_click', { context });
    onCta?.();
  };
  return (
    <div className={`flex flex-col gap-2 rounded-card border border-lime bg-lime-tint/40 ${compact ? 'p-3' : 'p-4'} sm:flex-row sm:items-center sm:gap-4`}>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-extrabold leading-tight text-white sm:text-lg">{c.title}</p>
        <p className="mt-1 text-[13px] leading-snug text-soft">{c.body} <BfCountdown className="whitespace-nowrap font-semibold text-lime" />.</p>
      </div>
      <button type="button" onClick={go} className="btn-lime h-11 w-full shrink-0 px-4 text-sm sm:h-10 sm:w-auto">
        {c.cta}
      </button>
    </div>
  );
}
