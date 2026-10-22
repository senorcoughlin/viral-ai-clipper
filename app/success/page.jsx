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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-center p-6">
      <div>
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">✓</span>
        </div>
        <h1 className="text-3xl font-bold text-emerald-400 mb-2">You're Pro!</h1>
        <p className="text-slate-400 mb-6">Unlimited generations unlocked. Welcome to the full experience.</p>
        <a href="/" className="inline-block px-6 py-2.5 bg-indigo-600 rounded-xl font-medium">Back to app</a>
      </div>
    </div>
  );
}

export default function Success() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading…</div>}>
      <SuccessContent />
    </Suspense>
  );
}
