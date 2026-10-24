'use client';
import { useEffect, useState } from 'react';
import { trackConversion } from '../lib/conversions';

// "Invite friends" card: shows the signed-in user's referral link with a copy button.
export default function ReferralCard({ compact = false }) {
  const [d, setD] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { fetch('/api/referral', { cache: 'no-store' }).then(r => r.json()).then(setD).catch(() => setD({ success: false })); }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(d.link); } catch {
      const t = document.createElement('textarea'); t.value = d.link; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    setCopied(true); trackConversion('referral_link_copied'); setTimeout(() => setCopied(false), 1800);
  };
  const n = d?.credits || 10;
  return (
    <div className={`rounded-xl border border-line2 bg-ink/60 ${compact ? 'p-3' : 'w-full max-w-[860px] p-5 sm:p-6'}`}>
      <div className={`font-display font-extrabold text-fg ${compact ? 'text-sm' : 'text-lg'}`}>Invite friends, get {n} free credits</div>
      <p className={`mt-1 text-muted ${compact ? 'text-xs' : 'text-sm'}`}>When a friend signs up with your link, you both get {n} credits. Each credit is one extra generation.</p>
      {d?.signedIn && d.link ? (
        <div className="mt-3 flex min-w-0 gap-2">
          <input readOnly value={d.link} onFocus={e => e.target.select()} aria-label="Your referral link"
            className="min-w-0 flex-1 rounded-lg border border-line2 bg-surface px-2.5 py-2 text-xs text-soft" />
          <button type="button" onClick={copy} className="btn-lime h-9 shrink-0 px-3 text-xs">{copied ? 'Copied' : 'Copy'}</button>
        </div>
      ) : d?.signedIn ? (
        <p className="mt-2 text-xs text-muted">Your link isn’t available right now. Try again later.</p>
      ) : d ? (
        <p className="mt-2 text-xs text-muted">Sign in with your email to get your invite link.</p>
      ) : null}
      {d?.signedIn && d.count > 0 && <p className="mt-2 text-xs text-lime">{d.count} friend{d.count === 1 ? '' : 's'} joined with your link.</p>}
    </div>
  );
}
