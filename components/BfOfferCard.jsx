'use client';
import AccountBar from './AccountBar';
import { LIMIT_COPY } from '../lib/limits';

const Check = ({ color = '#C6FF3D' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="m5 12 5 5L20 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// Pricing-card / upgrade-modal Black Friday block. Shows both sale prices,
// the monthly 7-day trial, and a date-gated end date. Mobile-first.
export default function BfOfferCard({
  offer,
  signedIn,
  isPro,
  compact = false,
  onStart,
  onStartYearly,
  onRegularMonthly,
  onAccountChange,
  showRegular = false,
}) {
  if (!offer?.active || isPro) return null;
  const used = offer.reason === 'used' || offer.used;
  const already = offer.reason === 'already_pro';
  const monthlyCta = already
    ? 'You’re already on Pro'
    : used
      ? 'Get Pro for $9.99/mo'
      : (signedIn ? 'Start 7-day free trial' : 'Sign in to start your free week');
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-lime bg-lime-tint/40 ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-7 items-center rounded-full bg-lime px-2.5 text-[11px] font-bold tracking-wide text-ink">BLACK FRIDAY</span>
        <span className="text-xs font-semibold text-lime">ends Jan 1</span>
      </div>
      <p className="font-display text-xl font-extrabold leading-tight text-white sm:text-2xl">{offer.headline || 'Black Friday deal — ends Jan 1'}</p>
      <p className="text-sm font-medium text-fg">{offer.body || 'Black Friday deal — ends Jan 1. Pro is $9.99/mo or $99.99/yr. 7 days free on monthly, cancel anytime.'}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface/80 p-3">
          <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">Monthly</span>
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-display text-2xl font-extrabold text-white">$9.99</span>
            <span className="text-sm text-muted">/mo</span>
            <span className="text-xs text-muted line-through">{offer.regularPrice || '$19.99'}</span>
          </p>
          <p className="text-xs text-soft">{used ? 'Sale price, no second free trial' : '7 days free, then $9.99/mo'}</p>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface/80 p-3">
          <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">Yearly</span>
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-display text-2xl font-extrabold text-white">$99.99</span>
            <span className="text-sm text-muted">/yr</span>
            <span className="text-xs text-muted line-through">{offer.regularYearlyPrice || '$199.99'}</span>
          </p>
          <p className="text-xs text-soft">about $8.33/mo · save 50%</p>
        </div>
      </div>
      <p className="text-[13px] leading-relaxed text-soft">{offer.disclosure}</p>
      <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
        <li className="flex items-center gap-2"><Check />7 days free on monthly, card required</li>
        <li className="flex items-center gap-2"><Check />Then $9.99/month or $99.99/year</li>
        <li className="flex items-center gap-2"><Check />{LIMIT_COPY.proFeature}</li>
        <li className="flex items-center gap-2"><Check />Cancel anytime</li>
        <li className="flex items-center gap-2"><Check />Black Friday deal — ends Jan 1</li>
      </ul>
      {used && <p className="text-xs text-soft">You already used the free trial. You can still get Pro at $9.99/month or $99.99/year until January 1.</p>}
      {!signedIn && (
        <div className="rounded-xl border border-line bg-surface p-3">
          <AccountBar inline startOpen prompt="Sign in or create an account to start your 7-day free Pro trial." onChange={() => onAccountChange?.()} />
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={already}
          onClick={() => onStart?.()}
          className="btn-lime h-12 w-full text-[15px] font-extrabold disabled:opacity-60 sm:flex-1"
        >
          {monthlyCta}
        </button>
        {!already && (
          <button
            type="button"
            onClick={() => onStartYearly?.()}
            className="btn-ghost h-12 w-full text-[15px] font-extrabold sm:flex-1"
          >
            Get Pro $99.99/yr
          </button>
        )}
      </div>
      {showRegular && !already && (
        <button type="button" onClick={() => onRegularMonthly?.()} className="text-center text-xs text-muted hover:text-soft">
          Or continue at the regular $19.99/month price
        </button>
      )}
    </div>
  );
}
