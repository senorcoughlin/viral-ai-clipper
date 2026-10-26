'use client';
import { useEffect, useState } from 'react';

// Admin-set announcement (GET /api/site). Dismiss is remembered per banner text.
export default function SiteBanner() {
  const [b, setB] = useState(null);
  useEffect(() => {
    if (location.pathname.startsWith('/admin')) return;
    fetch('/api/site').then(r => r.json()).then(d => {
      const x = d?.banner; if (!x?.text) return;
      try { if (localStorage.getItem('vac_banner_x') === String(x.at)) return; } catch {}
      setB(x);
    }).catch(() => {});
  }, []);
  if (!b) return null;
  const tone = b.tone === 'warn' ? 'bg-amber-400 text-black' : b.tone === 'promo' ? 'bg-lime-400 text-black' : 'bg-zinc-800 text-white';
  return (
    <div className={`${tone} relative z-50 flex items-center justify-center gap-3 px-4 py-2 text-center text-sm font-medium`} role="status">
      <span>{b.text}</span>
      <button aria-label="Dismiss" className="ml-2 rounded px-2 opacity-70 hover:opacity-100" onClick={() => { try { localStorage.setItem('vac_banner_x', String(b.at)); } catch {} setB(null); }}>✕</button>
    </div>
  );
}
