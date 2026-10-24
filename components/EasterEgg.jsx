'use client';
import { useRef, useState } from 'react';

// Tap the child 7 times fast to open the secret password box.
export default function EasterEgg({ children, onUnlocked }) {
  const taps = useRef([]);
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [needEmail, setNeedEmail] = useState(false);
  const [email, setEmail] = useState('');
  const tap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter(t => now - t < 2500), now];
    if (taps.current.length >= 7) { taps.current = []; setOpen(true); setMsg(''); setPw(''); }
  };
  const submit = async e => {
    e.preventDefault(); setBusy(true);
    const d = await fetch('/api/egg', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) }).then(r => r.json()).catch(() => ({ message: 'Something went wrong' }));
    setBusy(false); setMsg(d.message || '');
    if (d.needEmail) { setNeedEmail(true); if (d.email) setEmail(d.email); }
    if (d.success) onUnlocked?.();
  };
  return (
    <>
      <span onClick={tap} className="cursor-default select-none">{children}</span>
      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/80 p-4" onClick={() => setOpen(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line2 bg-surface p-6 shadow-modal">
            <p className="mb-1 font-display text-lg font-extrabold text-white">🥚 You found it</p>
            <p className="mb-4 text-sm text-soft">Enter the secret password.</p>
            <input type="password" autoFocus value={pw} onChange={e => setPw(e.target.value)} className="mb-3 h-11 w-full rounded-xl border border-line2 bg-ink px-3 text-white outline-none" />
            {msg && <p className="mb-3 text-sm text-lime">{msg}</p>}
            {needEmail && (
              <div className="mb-3 flex gap-2">
                <input type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-line2 bg-ink px-3 text-sm text-white outline-none" />
                <button type="button" disabled={busy || !email} onClick={async () => { setBusy(true); const d = await fetch('/api/auth/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).then(r => r.json()).catch(() => ({})); setBusy(false); setMsg(d.success ? `Link sent to ${email}. Open it on this phone, then tap the bolt 7 times again.` : (d.message || 'Could not send the link')); }} className="btn-ghost h-10 px-3 text-xs">Send link</button>
              </div>
            )}
            <div className="flex gap-2">
              <button disabled={busy || !pw} className="btn-lime h-10 flex-1 text-sm">{busy ? 'Checking…' : 'Unlock'}</button>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost h-10 px-4 text-sm">Close</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
