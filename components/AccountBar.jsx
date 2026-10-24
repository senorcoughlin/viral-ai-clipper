'use client';

import { useEffect, useState } from 'react';

export function readSession() {
  try { return JSON.parse(localStorage.getItem('viral_account') || 'null'); } catch { return null; }
}

export async function syncClips(clips) {
  const session = readSession();
  if (!session?.email || !session?.token) return;
  await fetch('/api/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save', email: session.email, token: session.token, clips }),
  });
}

export default function AccountBar({ onChange }) {
  const [session, setSession] = useState(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSession(readSession()); }, []);

  function save(next) {
    if (next) localStorage.setItem('viral_account', JSON.stringify(next));
    else localStorage.removeItem('viral_account');
    setSession(next);
    onChange?.(next);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'email') {
        const r = await fetch('/api/auth/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
        const d = await r.json().catch(() => ({}));
        setError(d.message || (d.success ? 'Check your inbox.' : 'Could not send the link'));
        return;
      }
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, email, password }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message || 'Could not sign in'); return; }
      save({ email: data.email, token: data.token });
      if (Array.isArray(data.clips)) localStorage.setItem('viral_clipper_cloud', JSON.stringify(data.clips));
      setOpen(false);
      setPassword('');
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  if (session) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden max-w-[160px] truncate text-soft sm:inline">{session.email}</span>
        <button type="button" onClick={() => { fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout', email: session.email }) }).catch(() => {}).finally(() => save(null)); }} className="text-muted hover:text-fg">Log out</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} className="text-sm font-medium text-soft hover:text-fg">Account</button>
      {open && (
        <form onSubmit={submit} className="absolute right-0 top-9 z-30 w-72 rounded-card border border-line bg-surface p-4 shadow-card">
          <div className="mb-3 flex gap-2 text-xs">
            <button type="button" onClick={() => setMode('login')} className={mode === 'login' ? 'text-lime' : 'text-muted'}>Log in</button>
            <button type="button" onClick={() => setMode('register')} className={mode === 'register' ? 'text-lime' : 'text-muted'}>Create account</button>
            <button type="button" onClick={() => setMode('email')} className={mode === 'email' ? 'text-lime' : 'text-muted'}>Email link</button>
          </div>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="mb-2 w-full rounded-input border border-line2 bg-ink px-3 py-2 text-sm outline-none focus:border-lime" />
          {mode !== 'email' && <input type="password" required value={password} onChange={e => setPassword(e.target.value)} minLength={mode === 'register' ? 8 : undefined} placeholder={mode === 'register' ? 'Password (8+ characters)' : 'Password'} className="mb-3 w-full rounded-input border border-line2 bg-ink px-3 py-2 text-sm outline-none focus:border-lime" />}
          {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
          <button type="submit" disabled={busy} className="btn-lime h-9 w-full text-sm">{busy ? 'Working…' : mode === 'login' ? 'Log in' : mode === 'email' ? 'Email me a sign-in link' : 'Create account'}</button>
          <p className="mt-2 text-[11px] text-muted">Clips save to your account and show up on any device.</p>
        </form>
      )}
    </div>
  );
}
