'use client';
import { useEffect, useRef, useState } from 'react';
import { funnel } from '../lib/funnel';

const SEGS = [3, 5, 3, 7, 3, 5, 3, 10, 3, 5, 3, 20]; // visual slices only; odds are server-side
const COLORS = ['#C6FF3D', '#1C1C26', '#9BE22B', '#2A2A38', '#C6FF3D', '#1C1C26', '#9BE22B', '#2A2A38', '#C6FF3D', '#1C1C26', '#9BE22B', '#FF4D6D'];
const SLICE = 360 / SEGS.length;
const PROMPT_KEY = 'vac_spin_prompt';
const nyDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

function useCountdown(to) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!to) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [to]);
  if (!to) return '';
  const s = Math.max(0, Math.floor((to - now) / 1000));
  return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`;
}

function Confetti() {
  const bits = Array.from({ length: 40 }, (_, i) => i);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden">
      {bits.map(i => (
        <i key={i} className="spin-confetti absolute top-0 block h-2 w-1.5 rounded-sm"
          style={{ left: `${(i * 37) % 100}%`, background: ['#C6FF3D', '#FF4D6D', '#fff', '#7CF'][i % 4], animationDelay: `${(i % 10) * 60}ms`, animationDuration: `${1200 + (i % 7) * 150}ms` }} />
      ))}
    </div>
  );
}

export default function SpinWheel({ onWon, onUpgrade }) {
  const [st, setSt] = useState(null);
  const [open, setOpen] = useState(false);
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState('');
  const [showOdds, setShowOdds] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const viewed = useRef(false);
  const left = useCountdown(st && !st.available && st.verified ? st.nextAt : result ? result.nextAt : null);

  const load = () => fetch('/api/spin', { cache: 'no-store' }).then(r => r.json()).then(d => { setSt(d); if (d.email) setEmail(e => e || d.email); return d; }).catch(() => null);

  useEffect(() => {
    load().then(d => {
      if (!d) return;
      // Auto-prompt at most once per ET day, only on a return visit, and only if a spin is plausible.
      try {
        const today = nyDate();
        const seen = localStorage.getItem('vac_seen_day');
        if (!seen) { localStorage.setItem('vac_seen_day', today); return; }
        if (localStorage.getItem(PROMPT_KEY) === today) return;
        if (d.verified && !d.available) return;
        localStorage.setItem(PROMPT_KEY, today);
        setTimeout(() => setOpen(true), 4000);
      } catch {}
    });
  }, []);
  useEffect(() => { if (open && !viewed.current) { viewed.current = true; funnel('spin_view', { available: !!st?.available }); } if (!open) viewed.current = false; }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = e => e.key === 'Escape' && !spinning && setOpen(false);
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, spinning]);

  const spin = async () => {
    if (spinning) return;
    funnel('spin_click');
    setSpinning(true); setMsg('');
    const d = await fetch('/api/spin', { method: 'POST' }).then(r => r.json()).catch(() => ({ message: 'Something went wrong. Try again.' }));
    if (!d.success) {
      setSpinning(false); setMsg(d.message || 'Could not spin');
      if (d.needEmail) setSt(s => ({ ...(s || {}), verified: false, needEmail: true }));
      if (d.already || d.limited) setSt(s => ({ ...(s || {}), available: false, nextAt: d.nextAt, todayPrize: d.todayPrize }));
      return;
    }
    const slots = SEGS.map((v, i) => v === d.prize ? i : -1).filter(i => i >= 0);
    const slot = slots[Math.floor(Math.random() * slots.length)];
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const target = 360 - (slot * SLICE + SLICE / 2);
    const base = rot - (rot % 360);
    setRot(base + (reduce ? 360 : 360 * 6) + target);
    setTimeout(() => {
      setSpinning(false); setResult(d);
      setSt(s => ({ ...(s || {}), available: false, nextAt: d.nextAt, todayPrize: d.prize, credits: d.credits }));
      funnel('spin_win', { prize: d.prize });
      onWon?.(d);
    }, reduce ? 400 : 4600);
  };

  const sendLink = async () => {
    setBusy(true);
    const d = await fetch('/api/auth/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).then(r => r.json()).catch(() => ({}));
    setBusy(false);
    setMsg(d.success ? `Link sent to ${email}. Open it on this device, then come back to spin.` : (d.message || 'Could not send the link'));
  };

  const available = !st || !st.verified || st.available;
  const wheelBg = `conic-gradient(${SEGS.map((_, i) => `${COLORS[i]} ${i * SLICE}deg ${(i + 1) * SLICE}deg`).join(',')})`;

  return (
    <>
      <button type="button" aria-label="Daily free spin" onClick={() => setOpen(true)}
        className={`fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-4 z-40 grid h-14 w-14 md:bottom-5 place-items-center rounded-full border-2 border-lime bg-ink text-2xl shadow-lg ${available ? 'spin-pulse' : 'opacity-80'}`}>
        <span aria-hidden>🎁</span>
        {available && <span className="absolute -right-1 -top-1 rounded-full bg-[#FF4D6D] px-1.5 text-[10px] font-bold text-white">1</span>}
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Daily spin" className="fixed inset-0 z-[70] grid place-items-center bg-ink/85 p-4" onClick={() => !spinning && setOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-line2 bg-surface p-5 text-center shadow-modal">
            {result && <Confetti />}
            <button type="button" aria-label="Close" disabled={spinning} onClick={() => setOpen(false)} className="absolute right-3 top-3 text-muted hover:text-fg">✕</button>
            <p className="font-display text-xl font-extrabold text-white">Daily free spin</p>
            <p className="mb-4 text-sm text-soft">Win 3 to 20 bonus clips. One spin a day.</p>

            <div className="relative mx-auto mb-4 aspect-square w-[min(72vw,260px)]">
              <div aria-hidden className="absolute left-1/2 top-[-6px] z-10 h-0 w-0 -translate-x-1/2 border-x-[11px] border-t-[18px] border-x-transparent border-t-white drop-shadow" />
              <div className="relative h-full w-full overflow-hidden rounded-full border-4 border-line2 transition-transform duration-[4500ms] ease-[cubic-bezier(.17,.67,.12,1)] motion-reduce:duration-300"
                style={{ background: wheelBg, transform: `rotate(${rot}deg)` }}>
                {SEGS.map((v, i) => (
                  <div key={i} aria-hidden className="pointer-events-none absolute inset-0" style={{ transform: `rotate(${i * SLICE + SLICE / 2}deg)` }}>
                    <span className="absolute left-1/2 top-[7%] -translate-x-1/2 text-[13px] font-extrabold" style={{ color: i % 2 && i !== 11 ? '#fff' : '#0A0A0F' }}>+{v}</span>
                  </div>
                ))}
              </div>
              <div className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-lime bg-ink text-lg">🎁</div>
            </div>

            {result ? (
              <div className="animate-fadeup">
                <p className="font-display text-2xl font-extrabold text-lime">+{result.prize} bonus clips!</p>
                <p className="mb-3 text-xs text-soft">Added to your credits. They're used after your 3 free clips each day.</p>
              </div>
            ) : st && st.verified && !st.available ? (
              <p className="mb-3 text-sm text-soft">{st.todayPrize ? <>You won <b className="text-lime">+{st.todayPrize}</b> today. </> : null}Come back tomorrow!</p>
            ) : st && !st.verified ? (
              <div className="mb-3 text-left">
                <p className="mb-2 text-sm text-soft">Confirm your email to spin and save your prize.</p>
                <div className="flex gap-2">
                  <input type="email" aria-label="Email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-line2 bg-ink px-3 text-base text-white outline-none" />
                  <button type="button" disabled={busy || !email.includes('@')} onClick={sendLink} className="btn-lime h-11 px-3 text-sm">{busy ? 'Sending…' : 'Send link'}</button>
                </div>
              </div>
            ) : (
              <button type="button" disabled={spinning || !st} onClick={spin} className="btn-lime mb-3 h-12 w-full text-base">{spinning ? 'Spinning…' : 'SPIN'}</button>
            )}

            {(result || (st?.verified && !st.available)) && (
              <>
                <p className="mb-3 text-xs text-muted">Next spin in <b className="text-white">{left}</b></p>
                {!st?.pro && <button type="button" onClick={() => { setOpen(false); onUpgrade?.(); }} className="btn-ghost mb-2 h-10 w-full text-sm">Go Pro for 200 clips/day · 50% off with LAUNCH50</button>}
                {st?.pro && <p className="mb-2 text-xs text-soft">You're Pro, so bonus clips are banked as credits for later.</p>}
              </>
            )}
            {msg && <p role="status" className="mb-2 text-sm text-lime">{msg}</p>}

            <button type="button" onClick={() => setShowOdds(o => !o)} className="text-xs text-muted underline">Odds</button>
            {showOdds && (
              <table className="mx-auto mt-2 text-xs text-soft"><tbody>
                {(st?.odds || []).map(o => <tr key={o.clips}><td className="pr-4 text-left">+{o.clips} clips</td><td className="text-right">{o.pct}%</td></tr>)}
              </tbody></table>
            )}
          </div>
        </div>
      )}
    </>
  );
}
