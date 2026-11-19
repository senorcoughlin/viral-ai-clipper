'use client';
import { useEffect, useState } from 'react';

// Home page raffle strip: prize, live entry count, countdown, CTA to /raffle. Compact so the link box stays above the fold.
export default function RaffleBanner() {
  const [info, setInfo] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    fetch('/api/raffle').then(r => r.json()).then(setInfo).catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = info ? Math.max(0, info.closesAt - now) : 0;
  const d = Math.floor(left / 864e5), h = Math.floor(left / 36e5) % 24, m = Math.floor(left / 6e4) % 60, s = Math.floor(left / 1e3) % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return (
    <div className="relative mx-auto mt-3 max-w-6xl px-5">
      <a href="/raffle" onClick={() => { try { window.va?.('event', { name: 'raffle_banner_click' }); } catch {} }}
        className="group relative flex animate-fadeup items-center gap-3 overflow-hidden rounded-2xl border border-lime/60 bg-gradient-to-r from-[#18210C] via-surface to-[#17122B] px-3 py-2.5 no-underline shadow-pro transition hover:-translate-y-0.5 hover:border-lime sm:gap-4 sm:px-4 sm:py-3">
        <span aria-hidden className="absolute inset-0 animate-shimmer bg-[linear-gradient(110deg,transparent_35%,rgba(198,255,61,.10)_50%,transparent_65%)] bg-[length:200%_100%]" />
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime shadow-glow sm:h-11 sm:w-11">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill="#0A0A0F" /></svg>
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block font-display text-[15px] font-extrabold leading-tight text-fg sm:text-[17px]">
            Win <span className="text-lime">Pro for a month</span><span className="hidden sm:inline">: unlimited clipping + every Pro feature</span>
          </span>
          <span className="mt-0.5 block text-[12px] leading-snug text-soft sm:hidden">
            Unlimited clipping + every Pro feature{info ? <> · <b className="font-mono text-fg tabular-nums">{d}d {pad(h)}h</b> left</> : null}
          </span>
          <span className="mt-0.5 hidden truncate text-[13px] text-soft sm:block">
            {info ? <>Drawing in <b className="font-mono text-fg tabular-nums">{d}d {pad(h)}:{pad(m)}:{pad(s)}</b> · {info.entries} {info.entries === 1 ? 'entry' : 'entries'} so far · from $1 or free</> : 'Monthly drawing · from $1 or enter free'}
          </span>
        </span>
        <span className="btn-lime relative h-10 shrink-0 px-3.5 text-[13px] sm:px-4 sm:text-sm"><span>Enter<span className="hidden sm:inline"> the raffle</span></span><span aria-hidden className="hidden transition group-hover:translate-x-0.5 sm:inline">→</span></span>
      </a>
    </div>
  );
}
