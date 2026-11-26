'use client';
import { useEffect, useState } from 'react';
import { offerCountdown, offerActive } from '../lib/bftrial';

// The page HTML is prerendered at deploy time and served from the CDN for hours or days, so a
// time-based first render never matches what the browser computes (React errors #425/#422 on every
// visit, which forces a full client re-render). Server and first client render both use this fixed
// text; the live countdown replaces it right after mount.
const STATIC_CD = { ended: false, totalMs: 1, days: 0, hours: 0, minutes: 0, seconds: 0, compact: 'until Jan 1', text: 'Ends Jan 1', label: 'until Jan 1' };

export function useOfferCountdown() {
  const [cd, setCd] = useState(STATIC_CD);
  useEffect(() => {
    setCd(offerCountdown());
    if (!offerActive()) return undefined;
    const t = setInterval(() => {
      const next = offerCountdown();
      setCd(next);
      if (next.ended) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, []);
  return cd;
}

// Live countdown to the real Black Friday end (Jan 1, 2027 11:59 PM ET). Hidden after it ends.
export default function BfCountdown({ compact = false, className = '' }) {
  const cd = useOfferCountdown();
  if (cd.ended) return null;
  return <span className={className}>{compact ? cd.compact : cd.text}</span>;
}
