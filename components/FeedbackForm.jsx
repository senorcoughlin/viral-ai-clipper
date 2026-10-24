'use client';
import { useEffect, useState } from 'react';
import { trackConversion } from '../lib/conversions';

const TYPES = [['bug', 'Bug'], ['feature', 'Feature idea'], ['general', 'General']];

export default function FeedbackForm() {
  const [type, setType] = useState('general');
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [hp, setHp] = useState('');
  const [state, setState] = useState('idle');
  const [err, setErr] = useState('');
  const [from, setFrom] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('type'); if (TYPES.some(([k]) => k === t)) setType(t);
    setFrom(q.get('from') || document.referrer || window.location.href);
    fetch('/api/account', { cache: 'no-store' }).then(r => r.json()).then(d => { if (d?.signedIn && d.email) setEmail(e => e || d.email); }).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (message.trim().length < 3) { setErr('Please write a short message.'); return; }
    setState('sending'); setErr('');
    try {
      const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, rating: rating || null, message, email, page: from, website: hp }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Something went wrong.');
      trackConversion('feedback_submitted', { type, rating: rating || undefined });
      setState('done');
    } catch (e2) { setErr(e2.message); setState('idle'); }
  }

  if (state === 'done') return (
    <div role="status" className="mt-8 rounded-card border border-lime bg-lime-tint p-5">
      <p className="font-display text-lg font-extrabold text-white">Thank you! 🙌</p>
      <p className="mt-1 text-sm text-soft">Your feedback landed. {email ? 'If we have questions we’ll reply to you by email.' : 'We read every message.'}</p>
      <a href="/" className="mt-3 inline-block text-sm font-semibold text-lime">Back to clipping →</a>
    </div>
  );

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-fg">What kind of feedback?</legend>
        <div className="flex flex-wrap gap-2">
          {TYPES.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${type === k ? 'border-lime bg-lime text-[#0A0A0F]' : 'border-line2 text-soft hover:text-fg'}`}>{l}</button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-fg">How’s it going so far? <span className="font-normal text-muted">(optional)</span></legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" aria-label={`${n} out of 5`} aria-pressed={rating === n} onClick={() => setRating(rating === n ? 0 : n)}
              className={`h-10 w-10 rounded-lg text-xl ${n <= rating ? 'text-lime' : 'text-muted'} hover:bg-surface`}>★</button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-fg">Your message</span>
        <textarea required maxLength={2000} rows={6} value={message} onChange={e => setMessage(e.target.value)}
          placeholder={type === 'bug' ? 'What happened, and what did you expect?' : type === 'feature' ? 'What would make this more useful for you?' : 'Anything on your mind…'}
          className="w-full rounded-xl border border-line2 bg-surface p-3 text-[15px] text-fg placeholder:text-muted focus:border-lime focus:outline-none" />
        <span className="mt-1 block text-right text-xs text-muted">{message.length}/2000</span>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-fg">Email <span className="font-normal text-muted">(optional, so we can follow up)</span></span>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" maxLength={254}
          className="w-full rounded-xl border border-line2 bg-surface p-3 text-[15px] text-fg placeholder:text-muted focus:border-lime focus:outline-none" />
      </label>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={hp} onChange={e => setHp(e.target.value)} aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      {err && <p role="alert" className="text-sm text-[#FF4D6D]">{err}</p>}
      <button type="submit" disabled={state === 'sending'} className="w-full rounded-xl bg-lime px-5 py-3 font-semibold text-[#0A0A0F] hover:brightness-110 disabled:opacity-60 sm:w-auto">{state === 'sending' ? 'Sending…' : 'Send feedback'}</button>
    </form>
  );
}
