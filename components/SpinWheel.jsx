'use client';
import { useEffect, useRef, useState } from 'react';
import { funnel } from '../lib/funnel';
import { offerPublic } from '../lib/bftrial';

// Visual slices only; the prize is chosen server-side (/api/spin) and the wheel animates to a matching slice.
const STYLE = {
  c3: { label: '+3', sub: 'clips', g: ['#D8FF5C', '#7ED321'], fg: '#0A0A0F' },
  c5: { label: '+5', sub: 'clips', g: ['#A78BFF', '#5B2EFF'], fg: '#FFFFFF' },
  c7: { label: '+7', sub: 'clips', g: ['#FFD27A', '#FF8A00'], fg: '#0A0A0F' },
  c10: { label: '+10', sub: 'clips', g: ['#67E8F9', '#0EA5E9'], fg: '#0A0A0F' },
  c20: { label: '+20', sub: 'clips', g: ['#FF7A93', '#E11D48'], fg: '#FFFFFF' },
  pro: { label: 'PRO', sub: '1 month', g: ['#FFF1A8', '#F59E0B'], fg: '#0A0A0F' },
};
const SEGS = ['c3', 'c5', 'c3', 'c7', 'c3', 'c10', 'c3', 'c5', 'c20', 'c5', 'c3', 'pro'];
const N = SEGS.length;
const SLICE = 360 / N;
const DURATION = 5600;
const BULBS = 24;
const JACKPOT = new Set(['pro', 'c20']);

const rad = (deg) => ((deg - 90) * Math.PI) / 180; // 0deg = top, clockwise
const pt = (r, deg) => [r * Math.cos(rad(deg)), r * Math.sin(rad(deg))];
function slicePath(i, r = 92) {
  const [x0, y0] = pt(r, i * SLICE), [x1, y1] = pt(r, (i + 1) * SLICE);
  return `M0 0 L${x0.toFixed(3)} ${y0.toFixed(3)} A${r} ${r} 0 0 1 ${x1.toFixed(3)} ${y1.toFixed(3)} Z`;
}
const easeOut = (t) => 1 - Math.pow(1 - t, 4.2);

function useCountdown(to) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!to) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [to]);
  if (!to) return '';
  const s = Math.max(0, Math.floor((to - now) / 1000));
  return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`;
}

function Burst({ big }) {
  const n = big ? 110 : 60;
  const colors = big ? ['#FFE066', '#F59E0B', '#FFF7D6', '#FF4D6D', '#C6FF3D', '#A78BFF'] : ['#C6FF3D', '#FF4D6D', '#A78BFF', '#67E8F9', '#FFB64D', '#FFFFFF'];
  const bits = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + (i % 3) * 0.3;
    const d = (big ? 170 : 130) + ((i * 53) % 120);
    return { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 40, r: (i * 97) % 720, c: colors[i % colors.length], w: 4 + (i % 3) * 2, delay: (i % 8) * 25, dur: 1100 + (i % 6) * 140 };
  });
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-[42%] z-30 h-0 w-0 motion-reduce:hidden">
      {bits.map((b, i) => (
        <i key={i} className="sw-burst absolute block rounded-[2px]"
          style={{ width: b.w, height: b.w * 1.8, background: b.c, '--dx': `${b.dx}px`, '--dy': `${b.dy}px`, '--r': `${b.r}deg`, animationDelay: `${b.delay}ms`, animationDuration: `${b.dur}ms`, boxShadow: `0 0 6px ${b.c}` }} />
      ))}
    </div>
  );
}

function prizeText(p) {
  if (p === 'pro') return '1 month of Pro';
  return `+${p} bonus clips`;
}

export default function SpinWheel({ onWon, onUpgrade }) {
  const [st, setSt] = useState(null);
  const [open, setOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState('');
  const [showOdds, setShowOdds] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(false);
  const [hidden, setHidden] = useState(false);
  const viewed = useRef(false);
  const rotRef = useRef(0);
  const wheelRef = useRef(null);
  const pointerRef = useRef(null);
  const audioRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => { fetch('/api/site').then(r => r.json()).then(d => setHidden(!!d?.flags?.hide_spin)).catch(() => {}); }, []);
  useEffect(() => { try { setSound(localStorage.getItem('vac_spin_sound') === '1'); } catch {} }, []);
  const left = useCountdown(st && !st.available && st.verified ? st.nextAt : result ? result.nextAt : null);

  const load = () => fetch('/api/spin', { cache: 'no-store' }).then(r => r.json()).then(d => { setSt(d); if (d.email) setEmail(e => e || d.email); return d; }).catch(() => null);

  // No automatic popup on load: opens on gift tap, or once after the first finished clip.
  useEffect(() => { load(); return () => cancelAnimationFrame(rafRef.current); }, []);
  useEffect(() => {
    const onDone = () => {
      try {
        if (localStorage.getItem('vac_spin_after_first')) return;
        localStorage.setItem('vac_spin_after_first', '1');
      } catch { return; }
      setTimeout(() => setOpen(true), 2500);
    };
    window.addEventListener('vac:clip-done', onDone);
    return () => window.removeEventListener('vac:clip-done', onDone);
  }, []);
  useEffect(() => { if (open && !viewed.current) { viewed.current = true; funnel('spin_view', { available: !!st?.available }); } if (!open) viewed.current = false; }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = e => e.key === 'Escape' && !spinning && setOpen(false);
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, spinning]);
  useEffect(() => { if (open && wheelRef.current) wheelRef.current.setAttribute('transform', `rotate(${rotRef.current})`); }, [open]);

  const tick = () => {
    const p = pointerRef.current;
    if (p) { p.classList.remove('sw-flick'); void p.offsetWidth; p.classList.add('sw-flick'); }
    if (!sound) return;
    try {
      const ctx = audioRef.current || (audioRef.current = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 1400 + Math.random() * 300;
      g.gain.setValueAtTime(0.06, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
      o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.06);
    } catch {}
  };
  const fanfare = (big) => {
    if (!sound) return;
    try {
      const ctx = audioRef.current || (audioRef.current = new (window.AudioContext || window.webkitAudioContext)());
      (big ? [523, 659, 784, 1047, 1319] : [659, 880, 1175]).forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.11;
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.3);
      });
    } catch {}
  };

  const animateTo = (target, reduce) => new Promise(resolve => {
    const from = rotRef.current;
    if (reduce) { rotRef.current = target; if (wheelRef.current) wheelRef.current.setAttribute('transform', `rotate(${target})`); return setTimeout(resolve, 250); }
    const t0 = performance.now();
    let lastSlot = Math.floor(from / SLICE);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / DURATION);
      const r = from + (target - from) * easeOut(t);
      rotRef.current = r;
      if (wheelRef.current) wheelRef.current.setAttribute('transform', `rotate(${r})`);
      const slot = Math.floor(r / SLICE);
      if (slot !== lastSlot) { lastSlot = slot; tick(); }
      if (t < 1) rafRef.current = requestAnimationFrame(step); else resolve();
    };
    rafRef.current = requestAnimationFrame(step);
  });

  const spin = async () => {
    if (spinning) return;
    funnel('spin_click');
    setSpinning(true); setMsg(''); setResult(null);
    try { if (sound && audioRef.current?.state === 'suspended') audioRef.current.resume(); } catch {}
    const d = await fetch('/api/spin', { method: 'POST' }).then(r => r.json()).catch(() => ({ message: 'Something went wrong. Try again.' }));
    if (!d.success) {
      setSpinning(false); setMsg(d.message || 'Could not spin');
      if (d.needEmail) setSt(s => ({ ...(s || {}), verified: false, needEmail: true }));
      if (d.already || d.limited) setSt(s => ({ ...(s || {}), available: false, nextAt: d.nextAt, todayPrize: d.todayPrize }));
      return;
    }
    const id = d.prizeId || (d.prize === 'pro' ? 'pro' : `c${d.prize}`);
    const slots = SEGS.map((v, i) => (v === id ? i : -1)).filter(i => i >= 0);
    const slot = slots.length ? slots[Math.floor(Math.random() * slots.length)] : 0;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const jitter = (Math.random() - 0.5) * SLICE * 0.6;
    const want = (360 - (slot * SLICE + SLICE / 2) + jitter + 360) % 360;
    const base = rotRef.current - (rotRef.current % 360);
    const target = base + (reduce ? 360 : 360 * 7) + want;
    await animateTo(target, reduce);
    setSpinning(false);
    const big = JACKPOT.has(id);
    setResult({ ...d, id, big });
    fanfare(big);
    try { if (big) navigator.vibrate?.([60, 40, 120]); } catch {}
    setSt(s => ({ ...(s || {}), available: false, nextAt: d.nextAt, todayPrize: d.prize, credits: d.credits, pro: d.pro || s?.pro }));
    funnel('spin_win', { prize: d.prize });
    onWon?.(d);
  };

  const sendLink = async () => {
    setBusy(true);
    const d = await fetch('/api/auth/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).then(r => r.json()).catch(() => ({}));
    setBusy(false);
    setMsg(d.success ? `Link sent to ${email}. Open it on this device, then come back to spin.` : (d.message || 'Could not send the link'));
  };
  const toggleSound = () => setSound(v => { const n = !v; try { localStorage.setItem('vac_spin_sound', n ? '1' : '0'); } catch {} return n; });

  const available = !st || !st.verified || st.available;
  if (hidden) return null;
  const big = result?.big;
  return (
    <>
      <button type="button" aria-label="Daily free spin" onClick={() => setOpen(true)}
        className={`sw-fab fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-4 z-40 grid h-14 w-14 place-items-center rounded-full text-2xl md:bottom-5 ${available ? 'spin-pulse' : 'opacity-80'}`}>
        <span aria-hidden className="relative">🎁</span>
        {available && <span aria-hidden className="absolute -right-1 -top-1 rounded-full bg-[#FF4D6D] px-1.5 text-[10px] font-bold text-white shadow-[0_0_10px_#FF4D6D]">1</span>}
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Daily spin" className="fixed inset-0 z-[70] grid place-items-center bg-[#05050A]/90 p-3 backdrop-blur-sm" onClick={() => !spinning && setOpen(false)}>
          <div onClick={e => e.stopPropagation()} className={`sw-card relative w-full max-w-[400px] rounded-[26px] p-[2px] ${big ? 'sw-card-jackpot' : ''}`}>
            <div className="relative max-h-[calc(100dvh-24px)] overflow-y-auto overflow-x-hidden rounded-[24px] bg-[radial-gradient(120%_80%_at_50%_0%,#2A1650_0%,#12101E_45%,#0B0B12_100%)] px-5 pb-5 pt-6 text-center">
              <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[120%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(198,255,61,.25),transparent)] blur-xl" />
              {result && <Burst big={big} />}
              <button type="button" aria-label="Close" disabled={spinning} onClick={() => setOpen(false)} className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full bg-white/5 text-muted hover:bg-white/10 hover:text-fg">✕</button>
              <button type="button" aria-label={sound ? 'Mute spin sounds' : 'Turn on spin sounds'} aria-pressed={sound} onClick={toggleSound} className="absolute left-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full bg-white/5 text-sm hover:bg-white/10">{sound ? '🔊' : '🔇'}</button>

              <p className="relative bg-gradient-to-r from-[#D8FF5C] via-[#FFE066] to-[#FF7A93] bg-clip-text font-display text-[26px] font-extrabold leading-tight tracking-tight text-transparent">Daily Free Spin</p>
              <p className="relative mb-4 text-[13px] text-soft">Win up to <b className="text-[#FF7A93]">20 bonus clips</b> or the jackpot: <b className="text-[#FFE066]">1 month of Pro</b>. One spin a day.</p>

              <div className={`relative mx-auto mb-5 aspect-square w-[min(78vw,300px)] ${spinning ? 'sw-spinning' : ''}`}>
                <div aria-hidden className="sw-halo absolute -inset-5 rounded-full" />
                {/* pointer */}
                <div ref={pointerRef} aria-hidden className="absolute left-1/2 top-[-14px] z-20 -translate-x-1/2 origin-[50%_20%]">
                  <svg width="34" height="44" viewBox="0 0 34 44"><defs><linearGradient id="swp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#FFE066" /></linearGradient></defs>
                    <path d="M17 42 3 12a14 14 0 1 1 28 0Z" fill="url(#swp)" stroke="#0A0A0F" strokeWidth="2.5" /><circle cx="17" cy="13" r="5" fill="#FF4D6D" /></svg>
                </div>
                <svg viewBox="-100 -100 200 200" className="relative h-full w-full drop-shadow-[0_18px_40px_rgba(0,0,0,.6)]">
                  <defs>
                    {Object.entries(STYLE).map(([k, s]) => (
                      <radialGradient key={k} id={`sw-${k}`} cx="0" cy="0" r="92" gradientUnits="userSpaceOnUse"><stop offset="0.15" stopColor={s.g[1]} /><stop offset="1" stopColor={s.g[0]} /></radialGradient>
                    ))}
                    <linearGradient id="sw-rim" x1="0" y1="-1" x2="0" y2="1"><stop offset="0" stopColor="#FFE9A3" /><stop offset=".5" stopColor="#B8860B" /><stop offset="1" stopColor="#FFE9A3" /></linearGradient>
                    <radialGradient id="sw-hub" cx="0" cy="-6" r="22" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#3A3A4A" /><stop offset="1" stopColor="#0A0A0F" /></radialGradient>
                  </defs>
                  {/* rim */}
                  <circle r="99" fill="url(#sw-rim)" />
                  <circle r="94.5" fill="#0A0A0F" />
                  {Array.from({ length: BULBS }, (_, i) => { const [x, y] = pt(96.8, i * (360 / BULBS)); return <circle key={i} cx={x} cy={y} r="2.4" className={`sw-bulb ${i % 2 ? 'sw-bulb-b' : ''}`} />; })}
                  {/* wheel */}
                  <g ref={wheelRef}>
                    {SEGS.map((k, i) => <path key={i} d={slicePath(i)} fill={`url(#sw-${k})`} stroke="#0A0A0F" strokeWidth="1.2" />)}
                    {SEGS.map((k, i) => {
                      const s = STYLE[k];
                      return (
                        <g key={`t${i}`} transform={`rotate(${i * SLICE + SLICE / 2})`}>
                          <g transform="translate(0 -60) rotate(-90)">
                            <text x="0" y="0" dominantBaseline="central" textAnchor="middle" fontFamily="var(--font-display), sans-serif" fontWeight="800" fontSize={k === 'pro' ? 14 : 16} fill={s.fg} letterSpacing=".5">{s.label}</text>
                          </g>
                          {k === 'pro' && <path d="M1.8 -90 -4.5 -80.5h4.2l-1 6.5 6.3 -9.3h-4.2Z" fill="#0A0A0F" />}
                        </g>
                      );
                    })}
                    <circle r="92" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="1" />
                  </g>
                  {/* glossy highlight */}
                  <path d="M-80 -30 A86 86 0 0 1 80 -30 A120 120 0 0 0 -80 -30Z" fill="rgba(255,255,255,.10)" />
                  {/* hub */}
                  <circle r="21" fill="url(#sw-rim)" />
                  <circle r="18" fill="url(#sw-hub)" />
                </svg>
                <button type="button" aria-label="Spin the wheel" disabled={spinning || !st || !st.verified || !st.available} onClick={spin}
                  className="sw-hubbtn absolute left-1/2 top-1/2 z-10 grid h-[17%] w-[17%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-display text-[11px] font-extrabold tracking-wide text-ink disabled:cursor-default">
                  {spinning ? '…' : 'SPIN'}
                </button>
              </div>

              {result ? (
                <div className="relative animate-pop">
                  {big && <p className="sw-jackpot-text font-display text-sm font-extrabold uppercase tracking-[.3em]">Jackpot!</p>}
                  <p className={`font-display text-[28px] font-extrabold leading-tight ${result.id === 'pro' ? 'text-[#FFE066] drop-shadow-[0_0_18px_rgba(255,224,102,.6)]' : big ? 'text-[#FF7A93] drop-shadow-[0_0_16px_rgba(255,77,109,.6)]' : 'text-lime drop-shadow-[0_0_14px_rgba(198,255,61,.5)]'}`}>
                    {result.id === 'pro' ? 'You won 1 month of Pro!' : `+${result.prize} bonus clips!`}
                  </p>
                  <p className="mb-3 mt-1 text-xs text-soft">
                    {result.id === 'pro'
                      ? <>Pro is on for <b className="text-fg">{st?.email || email}</b>{result.proUntil ? <> until <b className="text-fg">{new Date(result.proUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</b></> : null}. It never renews and is never charged.</>
                      : "Added to your credits. They're used after your 3 free generations each day."}
                  </p>
                </div>
              ) : st && st.verified && !st.available ? (
                <p className="mb-3 text-sm text-soft">{st.todayPrize ? <>You won <b className="text-lime">{prizeText(st.todayPrize)}</b> today. </> : null}Come back tomorrow!</p>
              ) : st && !st.verified ? (
                <div className="mb-3 text-left">
                  <p className="mb-2 text-sm text-soft">Confirm your email to spin and save your prize.</p>
                  <div className="flex gap-2">
                    <input type="email" aria-label="Email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-line2 bg-ink px-3 text-base text-white outline-none focus:border-lime" />
                    <button type="button" disabled={busy || !email.includes('@')} onClick={sendLink} className="btn-lime h-11 px-3 text-sm">{busy ? 'Sending…' : 'Send link'}</button>
                  </div>
                </div>
              ) : (
                <button type="button" disabled={spinning || !st} onClick={spin} className="sw-cta mb-3 h-[54px] w-full rounded-2xl font-display text-lg font-extrabold tracking-wide text-ink disabled:opacity-70">{spinning ? 'Spinning…' : 'SPIN TO WIN'}</button>
              )}

              {(result || (st?.verified && !st.available)) && (
                <>
                  <p className="mb-3 text-xs text-muted">Next spin in <b className="text-white">{left}</b></p>
                  {!st?.pro && <button type="button" onClick={() => { setOpen(false); onUpgrade?.(); }} className="btn-ghost mb-2 h-10 w-full text-sm">{offerPublic().active ? "Black Friday: Pro $9.99/mo or $99.99/yr" : "Go Pro for 200 generations a day"}</button>}
                  {st?.pro && result?.id !== 'pro' && <p className="mb-2 text-xs text-soft">You're Pro, so bonus clips are banked as credits for later.</p>}
                </>
              )}
              {msg && <p role="status" className="mb-2 text-sm text-lime">{msg}</p>}

              <button type="button" onClick={() => setShowOdds(o => !o)} className="text-xs text-muted underline">{showOdds ? 'Hide odds' : 'Odds'}</button>
              {showOdds && (
                <table className="mx-auto mt-2 text-xs text-soft"><tbody>
                  {(st?.odds || []).map(o => <tr key={o.id || o.clips}><td className="pr-4 text-left">{o.label || `+${o.clips} clips`}</td><td className="text-right font-mono">{o.pct}%</td></tr>)}
                </tbody></table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
