'use client';
import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function SuccessContent() {
  const params = useSearchParams();
  useEffect(() => {
    localStorage.setItem('viral_pro', 'true');
    const email = params.get('email');
    if (email) localStorage.setItem('viral_pro_email', email);
  }, [params]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink p-6 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-dots [background-size:28px_28px] opacity-60" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-spotlight blur-2xl" />
      {/* Orbit rings */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="h-[320px] w-[320px] rounded-full border border-dashed border-line2/60 animate-[spin_24s_linear_infinite]" />
        <div className="absolute inset-8 rounded-full border border-dashed border-line/40 animate-[spin_18s_linear_infinite_reverse]" />
        <div className="absolute inset-16 rounded-full border border-dashed border-lime/20 animate-[spin_30s_linear_infinite]" />
      </div>
      <div className="card relative flex w-full max-w-md flex-col items-center gap-5 overflow-hidden p-10 animate-fadeup">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {['10%', '26%', '42%', '58%', '74%', '90%'].map((l, i) => (
            <i key={i} className="absolute -top-2 h-3 w-2 rounded-sm animate-confetti" style={{ left: l, background: ['#C6FF3D', '#7C5CFF', '#FF4D6D', '#FFB64D'][i % 4], animationDelay: `${i * 0.25}s` }} />
          ))}
        </div>
        <span className="relative grid h-[88px] w-[88px] place-items-center rounded-full bg-lime shadow-[0_0_0_12px_rgba(198,255,61,.12),0_0_60px_rgba(198,255,61,.4)] animate-pop">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden><path d="m5 12 5 5L20 7" stroke="#0A0A0F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <h1 className="relative font-display text-3xl font-extrabold tracking-tight text-white">You're Pro!</h1>
        <p className="relative text-soft">Unlimited generations, no watermark, every AI style. Welcome aboard.</p>
        <span className="relative inline-flex h-8 items-center gap-2 rounded-full border border-lime bg-lime-tint px-3 text-xs font-semibold text-lime">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill="#C6FF3D" /></svg>Pro unlocked
        </span>
        <a href="/" className="btn-lime relative h-12 w-full no-underline">Start clipping</a>
      </div>
    </div>
  );
}

export default function Success() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-ink text-muted">Loading…</div>}>
      <SuccessContent />
    </Suspense>
  );
}
