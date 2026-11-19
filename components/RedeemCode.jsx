'use client';
import { useState } from 'react';

// "Have a code?" box. Validation and rewards are server-side (/api/codes/redeem).
export default function RedeemCode({ onRedeemed, compact = false, startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/codes/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const d = await r.json().catch(() => ({}));
      setMsg({ ok: !!d.success, text: d.message || (d.error) || 'Something went wrong. Please try again.' });
      if (d.success) { setCode(''); onRedeemed?.(d); try { window.dispatchEvent(new CustomEvent('vac:billing-changed')); } catch {} }
    } catch { setMsg({ ok: false, text: 'Network error. Please try again.' }); }
    setBusy(false);
  };

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className={`text-left font-medium text-lime underline-offset-2 hover:underline ${compact ? 'text-xs' : 'text-sm'}`}>Have a code?</button>;
  }
  return (
    <form onSubmit={submit} className="w-full">
      <label className={`mb-1.5 block font-semibold text-soft ${compact ? 'text-[11px] uppercase tracking-wide' : 'text-xs uppercase tracking-[.08em]'}`} htmlFor={compact ? 'code-m' : 'code-p'}>Have a code?</label>
      <div className="flex gap-2">
        <input id={compact ? 'code-m' : 'code-p'} value={code} onChange={e => setCode(e.target.value)} maxLength={40} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="Enter code"
          className={`min-w-0 flex-1 rounded-input border border-line2 bg-ink px-3 font-mono uppercase tracking-wide text-fg outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-muted focus:border-lime ${compact ? 'h-9 text-sm' : 'h-11 text-[15px]'}`} />
        <button type="submit" disabled={busy || !code.trim()} className={`btn-lime shrink-0 px-4 ${compact ? 'h-9 text-sm' : 'h-11 text-sm'}`}>{busy ? 'Checking…' : 'Apply'}</button>
      </div>
      {msg && <p role="status" className={`mt-2 text-xs font-medium ${msg.ok ? 'text-lime' : 'text-[#FF8FA3]'}`}>{msg.text}</p>}
    </form>
  );
}
