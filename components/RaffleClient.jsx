'use client';
import { useEffect, useRef, useState } from 'react';

const Bolt = ({ size = 18, fill = '#0A0A0F', className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill={fill} /></svg>
);
const Check = ({ color = '#C6FF3D' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0"><path d="m5 12 5 5L20 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const PERKS = [
  'Unlimited clipping*',
  'No watermark on any clip',
  'Pro editing: color looks, caption styles, speed, fades',
  'Batch up to 10 links at once',
  'CSV export + priority processing',
  'Every Pro feature, including new ones',
];
const nf = new Intl.NumberFormat('en-US');

function useCountdown(target) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = Math.max(0, (target || 0) - now);
  return { d: Math.floor(left / 864e5), h: Math.floor(left / 36e5) % 24, m: Math.floor(left / 6e4) % 60, s: Math.floor(left / 1e3) % 60, done: target && left === 0 };
}

function Unit({ v, label }) {
  return (
    <div className="flex min-w-[64px] flex-col items-center rounded-2xl border border-line2 bg-ink/60 px-3 py-3 backdrop-blur sm:min-w-[84px] sm:py-4">
      <span key={v} className="animate-fadeup font-mono text-3xl font-semibold tabular-nums text-fg sm:text-[44px] sm:leading-none">{String(v).padStart(2, '0')}</span>
      <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-muted sm:text-[11px]">{label}</span>
    </div>
  );
}

function PrizeTicket() {
  return (
    <div className="relative mx-auto w-full max-w-[380px] animate-floaty">
      <div aria-hidden className="absolute -inset-10 rounded-full bg-spotlight blur-2xl" />
      <div className="relative overflow-hidden rounded-[28px] border border-lime/60 bg-gradient-to-br from-[#1B2410] via-surface to-[#17122B] p-7 shadow-pro">
        <div aria-hidden className="absolute inset-0 animate-shimmer bg-[linear-gradient(110deg,transparent_30%,rgba(198,255,61,.10)_45%,transparent_60%)] bg-[length:200%_100%]" />
        <div aria-hidden className="absolute -left-4 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-ink" />
        <div aria-hidden className="absolute -right-4 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-ink" />
        <div className="relative flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-lime bg-lime-tint px-3 py-1 text-[11px] font-bold tracking-wide text-lime"><Bolt size={12} fill="#C6FF3D" />GRAND PRIZE</span>
          <span className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted">$19.99 value</span>
        </div>
        <div className="relative mt-6 flex items-end gap-3">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-lime shadow-glow"><Bolt size={34} /></span>
          <div>
            <div className="font-display text-[44px] font-extrabold leading-none tracking-tight text-fg">PRO</div>
            <div className="mt-1 font-display text-lg font-bold text-lime">for a whole month</div>
          </div>
        </div>
        <div className="relative my-6 border-t border-dashed border-line2" />
        <ul className="relative flex flex-col gap-2.5 text-[14px] text-soft">
          {PERKS.map(p => <li key={p} className="flex items-center gap-2.5"><Check />{p}</li>)}
        </ul>
      </div>
    </div>
  );
}

function Confetti() {
  const bits = Array.from({ length: 28 });
  const colors = ['#C6FF3D', '#7C5CFF', '#FF4D6D', '#FFB64D', '#EDEDF3'];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden">
      {bits.map((_, i) => (
        <span key={i} className="absolute top-0 h-2.5 w-1.5 animate-confetti rounded-sm" style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 7) * 0.18}s` }} />
      ))}
    </div>
  );
}

export default function RaffleClient() {
  const [info, setInfo] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [agree, setAgree] = useState(false);
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null); // { tone: 'ok'|'err', text }
  const [celebrate, setCelebrate] = useState(false);
  const shownAt = useRef(Date.now());
  const formRef = useRef(null);

  const load = (session) => fetch('/api/raffle' + (session ? `?session=${encodeURIComponent(session)}` : ''), { cache: 'no-store' }).then(r => r.json()).then(d => { setInfo(d); return d; }).catch(() => null);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem('vac_raffle_me') || '{}'); if (s.name) setName(s.name); if (s.email) setEmail(s.email); } catch {}
    const q = new URLSearchParams(location.search);
    const sid = q.get('session_id');
    if (q.get('entered') === 'paid' && sid) {
      setCelebrate(true);
      setMsg({ tone: 'ok', text: 'Payment received! Your entries are being added…' });
      let tries = 0;
      const poll = async () => {
        const d = await load(sid);
        if (d?.session?.logged) { setMsg({ tone: 'ok', text: `You're in! Your entries are locked in for the ${d.monthLabel} drawing. Good luck!` }); return; }
        if (++tries < 10) setTimeout(poll, 2000);
        else setMsg({ tone: 'ok', text: 'Payment received. Your entries can take a minute to show up. You will also get a Stripe receipt by email.' });
      };
      poll();
    } else {
      if (q.get('entered') === 'cancel') setMsg({ tone: 'err', text: 'Checkout canceled. No charge was made.' });
      load();
    }
    const t = setInterval(() => load(), 30000);
    return () => clearInterval(t);
  }, []);

  const cd = useCountdown(info?.closesAt);
  const remember = () => { try { localStorage.setItem('vac_raffle_me', JSON.stringify({ name, email })); } catch {} };
  const check = () => {
    if (name.trim().length < 2) return 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim())) return 'Please enter a valid email address.';
    if (!agree) return 'Please confirm you are 18+ and agree to the Official Rules.';
    return null;
  };
  const needForm = (e) => { setMsg({ tone: 'err', text: e }); formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

  const pay = async (pack) => {
    const e = check(); if (e) return needForm(e);
    setBusy(pack); setMsg(null); remember();
    try {
      const r = await fetch('/api/raffle/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pack, name, email, agree }) });
      const d = await r.json();
      if (d.url) { location.href = d.url; return; }
      setMsg({ tone: 'err', text: d.error || 'Could not start checkout.' });
    } catch { setMsg({ tone: 'err', text: 'Network error. Please try again.' }); }
    setBusy('');
  };

  const free = async () => {
    const e = check(); if (e) return needForm(e);
    setBusy('free'); setMsg(null); remember();
    try {
      const r = await fetch('/api/raffle/free', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, agree, website, elapsed: Date.now() - shownAt.current }) });
      const d = await r.json();
      setMsg({ tone: d.ok ? 'ok' : 'err', text: d.message || d.error || 'Something went wrong.' });
      if (d.ok && !d.duplicate) { setCelebrate(true); load(); }
    } catch { setMsg({ tone: 'err', text: 'Network error. Please try again.' }); }
    setBusy('');
  };

  const input = 'h-12 w-full rounded-input border border-line2 bg-ink/70 px-4 text-[15px] text-fg placeholder:text-muted outline-none transition focus:border-lime focus:ring-2 focus:ring-lime/25';

  return (
    <div className="relative">
      {celebrate && <Confetti />}
      {/* HERO */}
      <section className="relative grid grid-cols-1 items-center gap-10 pb-14 pt-8 sm:pt-14 md:grid-cols-[1.1fr_.9fr]">
        <div className="flex min-w-0 animate-fadeup flex-col gap-5">
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-line2 bg-surface py-1 pl-1.5 pr-3 text-[13px] font-medium text-soft">
            <span className="inline-flex h-[22px] items-center rounded-full bg-hot px-2 text-[11px] font-bold tracking-wide text-white">LIVE</span>
            {info ? `${info.monthLabel} drawing` : 'Monthly drawing'}
          </span>
          <h1 className="font-display text-[34px] font-extrabold leading-[1.04] tracking-tight text-white sm:text-[52px] md:text-[60px]">
            Win <span className="bg-gradient-to-r from-lime to-[#7CFFB2] bg-clip-text text-transparent">Pro for a month</span>.
          </h1>
          <p className="max-w-[540px] text-[16px] leading-relaxed text-soft sm:text-[17px]">
            Unlimited clipping* and every Pro feature for 31 days. One winner is drawn at random on the last day of every month. Entries start at $1, and there's always a free way to enter.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a href="#enter" className="btn-lime h-[52px] px-6 text-[15px]"><Bolt />Enter the raffle</a>
            <a href="#free" className="btn-ghost h-[52px] px-5 text-[15px]">Enter free</a>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
            <span><b className="font-mono text-lg text-fg tabular-nums">{info ? nf.format(info.entries) : '–'}</b> entries this month</span>
            <span><b className="font-mono text-lg text-fg tabular-nums">{info ? nf.format(info.entrants) : '–'}</b> {info?.entrants === 1 ? 'person' : 'people'} entered</span>
            {info?.lastWinner && <span>Last winner: <b className="text-fg">{info.lastWinner.name}</b> ({info.lastWinner.monthLabel})</span>}
          </div>
        </div>
        <PrizeTicket />
      </section>

      {/* COUNTDOWN */}
      <section aria-label="Countdown to the drawing" className="card relative overflow-hidden px-5 py-7 text-center sm:px-10">
        <div aria-hidden className="absolute inset-0 bg-spotlight-violet opacity-70" />
        <p className="eyebrow relative">Entries close in</p>
        <div className="relative mt-4 flex justify-center gap-2 sm:gap-4">
          <Unit v={cd.d} label="days" /><Unit v={cd.h} label="hours" /><Unit v={cd.m} label="min" /><Unit v={cd.s} label="sec" />
        </div>
        <p className="relative mt-4 text-sm text-muted">
          {info ? <>Entries close {new Date(info.closesAt).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET, and the winner is drawn right after.</> : 'Loading…'}
        </p>
      </section>

      {/* ENTER */}
      <section id="enter" className="scroll-mt-24 pb-6 pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">Get your entries</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">More entries, better odds</h2>
          <p className="mt-3 text-soft">Every entry has the same chance, whether it's paid or free.</p>
        </div>

        <div ref={formRef} className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-soft">Your name
            <input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" autoComplete="name" maxLength={80} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-soft">Email (we'll contact the winner here)
            <input className={input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" maxLength={200} />
          </label>
          <label aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-soft sm:col-span-2">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#C6FF3D]" />
            <span>I'm 18 or older and agree to the <a href="/raffle/rules" className="text-lime underline-offset-2 hover:underline">Official Rules</a>.</span>
          </label>
        </div>

        {msg && (
          <div role="status" className={`mx-auto mt-5 max-w-3xl animate-fadeup rounded-input border px-4 py-3 text-sm font-medium ${msg.tone === 'ok' ? 'border-lime/60 bg-lime-tint text-lime' : 'border-hot/50 bg-hot/10 text-[#FF8FA3]'}`}>{msg.text}</div>
        )}

        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="card flex flex-col p-7 transition duration-300 hover:-translate-y-1 hover:border-muted">
            <p className="text-sm font-semibold text-soft">Starter</p>
            <div className="mt-3 flex items-baseline gap-2"><span className="font-display text-5xl font-extrabold text-fg">$1</span><span className="text-muted">one-time</span></div>
            <p className="mt-2 text-lg font-semibold text-fg">1 entry</p>
            <p className="mt-1 text-sm text-muted">Good for trying your luck.</p>
            <button disabled={!!busy} onClick={() => pay('one')} className="btn-ghost mt-7 h-[52px] w-full text-[15px]">{busy === 'one' ? 'Opening checkout…' : 'Get 1 entry for $1'}</button>
          </div>
          <div className="relative flex flex-col rounded-card border border-lime bg-gradient-to-b from-[#18210C] to-surface p-7 shadow-pro transition duration-300 hover:-translate-y-1">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 animate-pop whitespace-nowrap rounded-full bg-lime px-3 py-1 text-[11px] font-extrabold tracking-wide text-ink">BEST VALUE<span className="hidden sm:inline"> · 5× THE CHANCES</span></span>
            <p className="text-sm font-semibold text-lime">Power pack</p>
            <div className="mt-3 flex items-baseline gap-2"><span className="font-display text-5xl font-extrabold text-fg">$4</span><span className="text-muted">one-time</span></div>
            <p className="mt-2 text-lg font-semibold text-fg">5 entries <span className="ml-1 rounded-full bg-lime-tint px-2 py-0.5 text-xs font-bold text-lime">$0.80 each</span></p>
            <p className="mt-1 text-sm text-muted">You get 5 times the chances of a single entry for 20% less per entry.</p>
            <button disabled={!!busy} onClick={() => pay('five')} className="btn-lime mt-7 h-[52px] w-full text-[15px]"><Bolt />{busy === 'five' ? 'Opening checkout…' : 'Get 5 entries for $4'}</button>
          </div>
        </div>
        <p className="mx-auto mt-4 max-w-3xl text-center text-[13px] text-muted">
          <b className="text-soft">No purchase necessary.</b> <a href="#free" className="text-lime hover:underline">Enter free</a> · Secure checkout by Stripe · Payments are not charitable donations and are not tax-deductible.
        </p>
      </section>

      {/* FREE ENTRY */}
      <section id="free" className="scroll-mt-24 py-12">
        <div className="card mx-auto flex max-w-3xl flex-col items-center gap-4 p-7 text-center sm:flex-row sm:text-left">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-line2 bg-ink text-2xl">🎟️</div>
          <div className="flex-1">
            <h3 className="font-display text-xl font-bold text-fg">Free entry, no purchase necessary</h3>
            <p className="mt-1 text-sm text-soft">Use your name and email above to get 1 free entry, once per person each month. It has exactly the same chance as a paid entry.</p>
          </div>
          <button disabled={!!busy} onClick={free} className="btn-ghost h-12 w-full shrink-0 px-5 text-[15px] sm:w-auto">{busy === 'free' ? 'Entering…' : 'Get my free entry'}</button>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="pb-10 pt-6">
        <h2 className="text-center font-display text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">How it works</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            ['1', 'Enter', 'Get 1 entry for $1, 5 entries for $4, or 1 free entry each month.'],
            ['2', 'Drawing', `On the last day of the month, after entries close at 10 PM ET, one entry is picked at random. Each entry counts once.`],
            ['3', 'Win Pro', 'We email the winner, and Pro turns on for their email address for 31 days. It never renews and is never charged.'],
          ].map(([n, t, d], i) => (
            <div key={n} className="card animate-fadeup p-6" style={{ animationDelay: `${i * 0.08}s` }}>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-lime font-display font-extrabold text-ink">{n}</span>
              <h3 className="mt-4 font-display text-lg font-bold text-fg">{t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-soft">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-[12px] leading-relaxed text-muted">
          *Unlimited clipping under Pro's fair-use limit of 200 generations a day. Open to legal residents 18+ where permitted; void where prohibited. Your odds depend on how many entries are received.
          Sponsor: Nathan Coughlin / Viral AI Clipper. See the <a href="/raffle/rules" className="text-lime hover:underline">Official Rules</a>.
        </p>
      </section>
    </div>
  );
}
