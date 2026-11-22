'use client';
import AccountBar from './AccountBar';

const Check = ({ color = '#C6FF3D' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="m5 12 5 5L20 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// Pricing-card / upgrade-modal Black Friday trial block. Mobile-first, honest disclosure.
export default function BfOfferCard({
  offer,
  signedIn,
  isPro,
  compact = false,
  onStart,
  onRegularMonthly,
  onAccountChange,
  showRegular = false,
}) {
  if (!offer?.active || isPro) return null;
  const used = offer.reason === 'used' || offer.used;
  const already = offer.reason === 'already_pro';
  const cta = already ? 'You’re already on Pro' : used ? 'Get Pro for $9.99/mo' : (signedIn ? 'Start 7-day free trial' : 'Sign in to start your free week');
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-lime bg-lime-tint/40 ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-7 items-center rounded-full bg-lime px-2.5 text-[11px] font-bold tracking-wide text-ink">BLACK FRIDAY</span>
        <span className="text-xs font-semibold text-lime">Offer ends Dec 7</span>
      </div>
      <p className="font-display text-xl font-extrabold leading-tight text-white sm:text-2xl">{offer.headline || '7 days of Pro free'}</p>
      <p className="text-sm font-medium text-fg">{offer.body || '7 days free, then $9.99/mo, cancel anytime. Offer ends Dec 7.'}</p>
      <p className="text-[13px] leading-relaxed text-soft">{offer.disclosure}</p>
      <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
        <li className="flex items-center gap-2"><Check />7 days free, card required</li>
        <li className="flex items-center gap-2"><Check />Then $9.99/month</li>
        <li className="flex items-center gap-2"><Check />Cancel anytime</li>
        <li className="flex items-center gap-2"><Check />Offer ends December 7</li>
      </ul>
      {used && <p className="text-xs text-soft">You already used the free trial. You can still get Pro at the sale price of $9.99/month until December 7.</p>}
      {!signedIn && (
        <div className="rounded-xl border border-line bg-surface p-3">
          <AccountBar inline startOpen prompt="Sign in or create an account to start your 7-day free Pro trial." onChange={() => onAccountChange?.()} />
        </div>
      )}
      <button
        type="button"
        disabled={already}
        onClick={() => onStart?.()}
        className="btn-lime h-12 w-full text-[15px] font-extrabold disabled:opacity-60"
      >
        {cta}
      </button>
      {showRegular && !already && (
        <button type="button" onClick={() => onRegularMonthly?.()} className="text-center text-xs text-muted hover:text-soft">
          Or continue at the regular $19.99/month price
        </button>
      )}
    </div>
  );
}
