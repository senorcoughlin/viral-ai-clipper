'use client';
import { useEffect, useState } from 'react';
import { offerCountdown, offerActive } from '../lib/bftrial';

export function useOfferCountdown(now) {
  const [cd, setCd] = useState(() => offerCountdown(now));
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
