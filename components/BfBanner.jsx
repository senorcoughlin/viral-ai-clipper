'use client';
import { useEffect, useState } from 'react';
import { offerPublic } from '../lib/bftrial';
import BfCountdown from './BfCountdown';
import { funnel } from '../lib/funnel';

const DISMISS_KEY = 'vac_promo_bf2026';

// Site-wide Black Friday banner with a live countdown to the real end date.
// Hidden after the offer ends, for Pro users, or if dismissed.
export default function BfBanner() {
  const [offer, setOffer] = useState(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let off = false;
    const pub = offerPublic();
    try { if (!pub.active || localStorage.getItem(DISMISS_KEY) === '1') { setHidden(true); return; } } catch {}
    fetch('/api/billing', { cache: 'no-store' }).then(r => r.json()).then(d => {
      if (off) return;
      if (d?.pro) { setHidden(true); return; }
      const o = d?.offer && typeof d.offer.active === 'boolean' ? d.offer : pub;
      setOffer(o);
      setHidden(!o.active);
    }).catch(() => {
      if (off) return;
      setOffer(pub);
      setHidden(!pub.active);
    });
    return () => { off = true; };
  }, []);

  if (hidden || !offer?.active) return null;

  const go = (e) => {
    funnel('bf_banner_click');
    try { window.dispatchEvent(new Event('vac:open-pricing')); } catch {}
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (path === '/' || path === '/studio' || path === '') {
      e.preventDefault();
      const el = document.getElementById('pricing');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const dismiss = () => {
    funnel('bf_banner_dismiss');
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
    setHidden(true);
  };

  return (
    <div className="relative z-50 bg-lime px-3 py-2 text-ink sm:px-4" role="status">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 sm:gap-3">
        <span className="hidden h-6 shrink-0 items-center rounded-full bg-ink px-2 text-[10px] font-bold tracking-wide text-lime sm:inline-flex">50% OFF</span>
        <span className="min-w-0 text-center text-[12px] font-semibold leading-snug sm:text-[13px] md:text-sm">
          <span className="sm:hidden">BF deal: $9.99/mo or $99.99/yr · </span>
          <span className="hidden sm:inline">Black Friday: $9.99/mo (7 days free) or $99.99/yr · 50% off · </span>
          <BfCountdown className="whitespace-nowrap font-extrabold" />
        </span>
        <a href="/#pricing" onClick={go} className="shrink-0 rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-bold text-lime no-underline hover:bg-ink/90">Get the deal</a>
        <button type="button" aria-label="Dismiss Black Friday banner" className="shrink-0 rounded px-1.5 text-ink/70 hover:text-ink" onClick={dismiss}>✕</button>
      </div>
    </div>
  );
}
