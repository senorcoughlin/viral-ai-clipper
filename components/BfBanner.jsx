'use client';
import { useEffect, useState } from 'react';
import { offerPublic } from '../lib/bftrial';

const DISMISS_KEY = 'vac_promo_bf2026';

// Site-wide Black Friday banner. Hidden after the offer ends, for Pro users, or if dismissed.
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
  return (
    <div className="relative z-50 flex items-center justify-center gap-2 bg-lime px-3 py-2 text-center text-[13px] font-semibold leading-snug text-ink sm:gap-3 sm:px-4 sm:text-sm" role="status">
      <span className="min-w-0">{offer.body || 'Black Friday deal — ends Jan 1. Pro is $9.99/mo or $99.99/yr.'}</span>
      <a href="/#pricing" className="shrink-0 rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-bold text-lime no-underline hover:bg-ink/90">Get the deal</a>
      <button type="button" aria-label="Dismiss" className="shrink-0 rounded px-1.5 text-ink/70 hover:text-ink" onClick={() => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch {} setHidden(true); }}>✕</button>
    </div>
  );
}
