'use client';

import { useState, useEffect } from 'react';
import ClipPlayer from '../components/ClipPlayer';
import ViralScoreMeter from '../components/ViralScoreMeter';

const FREE_DAILY_LIMIT = 3;

const FORMATS = [
  { value: 'shorts_9_16', label: '9:16' },
  { value: 'landscape_16_9', label: '16:9' },
  { value: 'square_1_1', label: '1:1' },
];
const STYLES = [
  { value: 'character_swap', label: 'Character Swap' },
  { value: 'anime_action', label: 'Anime Action' },
  { value: 'kids_3d', label: '3D Kids' },
  { value: 'clean_viral', label: 'Clean 4K' },
];
const HOOKS = ['“Nobody tells you this about…”', '“I was wrong about…”', '“The $40k mistake”', '“Watch till the end”', '“This changed everything”', '“POV: you finally…”', '“Stop doing this”', '“3 things I wish I knew”'];
const PRICE = { monthly: { amount: '$29', per: '/mo', plan: 'pro_monthly' }, yearly: { amount: '$199', per: '/yr · about $17/mo', plan: 'pro_yearly' } };

/* ---------- small icons (inline SVG, no deps) ---------- */
const Bolt = ({ className = '', fill = '#0A0A0F', size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill={fill} /></svg>
);
const Check = ({ color = '#C6FF3D' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="m5 12 5 5L20 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Link = ({ color = '#8A8AA0' }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" stroke={color} strokeWidth="2" strokeLinecap="round" /></svg>
);
const Sparkle = ({ color = '#7C5CFF' }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 3v4m0 10v4M3 12h4m10 0h4M6.3 6.3l2.8 2.8m5.8 5.8 2.8 2.8M6.3 17.7l2.8-2.8m5.8-5.8 2.8-2.8" stroke={color} strokeWidth="2" strokeLinecap="round" /></svg>
);
const Download = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="#FF4D6D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export default function Home() {
  const [videoUrl, setVideoUrl] = useState('');
  const [clipFormat, setClipFormat] = useState('shorts_9_16');
  const [aiStyle, setAiStyle] = useState('character_swap');
  const [autoSubtitles, setAutoSubtitles] = useState(true);
  const [aiHook, setAiHook] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [stage, setStage] = useState(0);
  const [clips, setClips] = useState([]);
  const [history, setHistory] = useState([]);
  const [showPricing, setShowPricing] = useState(false);
  const [dailyCount, setDailyCount] = useState(0);
  const [isPro, setIsPro] = useState(false); // later from auth/subscription
  const [billing, setBilling] = useState('yearly');
  const [justFinished, setJustFinished] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('viral_clipper_history');
    if (saved) try { setHistory(JSON.parse(saved)); } catch {}

    const today = new Date().toDateString();
    const stored = localStorage.getItem('viral_daily');
    if (stored) {
      const data = JSON.parse(stored);
      if (data.date === today) setDailyCount(data.count || 0);
      else localStorage.setItem('viral_daily', JSON.stringify({ date: today, count: 0 }));
    }

    const pro = localStorage.getItem('viral_pro') === 'true';
    setIsPro(pro);
  }, []);

  useEffect(() => {
    if (history.length) localStorage.setItem('viral_clipper_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (!isProcessing) return;
    const stages = ['Fetching video…', 'Transcribing audio…', 'Finding the hooks…', 'Rendering clips…'];
    let i = 0;
    setStage(0);
    setStatusMessage(stages[0]);
    const id = setInterval(() => { i = (i + 1) % stages.length; setStage(i); setStatusMessage(stages[i]); }, 1000);
    return () => clearInterval(id);
  }, [isProcessing]);

  useEffect(() => {
    if (!justFinished) return;
    const id = setTimeout(() => setJustFinished(false), 4000);
    return () => clearTimeout(id);
  }, [justFinished]);

  const incrementDaily = () => {
    const today = new Date().toDateString();
    const next = dailyCount + 1;
    setDailyCount(next);
    localStorage.setItem('viral_daily', JSON.stringify({ date: today, count: next }));
  };

  const handleClipping = async (e) => {
    e.preventDefault();
    if (!videoUrl.trim()) return;
    if (!isPro && dailyCount >= FREE_DAILY_LIMIT) {
      setShowPricing(true);
      return;
    }

    const urls = videoUrl.split(/[\n,]/).map(u => u.trim()).filter(Boolean);
    if (!urls.length) return;

    setIsProcessing(true);
    setClips([]);
    try {
      let all = [];
      for (const url of urls) {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: url, clipFormat, autoSubtitles, aiHook, aiStyle }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message);
        const batch = (result.data.generatedClips || []).map(c => ({
          ...c,
          title: urls.length > 1 ? `[${url.slice(0, 18)}…] ${c.title}` : c.title
        }));
        all = [...all, ...batch];
      }
      all.sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));
      setClips(all);
      setJustFinished(true);
      if (!isPro) incrementDaily();
      setHistory(prev => [{ id: Date.now(), url: videoUrl, format: clipFormat, aiStyle, clips: all }, ...prev].slice(0, 5));
    } catch {
      alert('Processing failed. Try again.');
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  const handleUpgrade = async (plan) => {
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType: plan })
      });
      const data = await res.json();
      if (data.success) window.open(data.data.checkoutUrl, '_blank');
    } catch {}
  };

  const unlockPro = () => {
    localStorage.setItem('viral_pro', 'true');
    setIsPro(true);
    setShowPricing(false);
  };

  const freeLeft = Math.max(0, FREE_DAILY_LIMIT - dailyCount);
  const topScore = clips.length ? Math.max(...clips.map(c => c.viralScore || 0)) : 0;
  const price = PRICE[billing];

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink">
      {/* background: dot grid + spotlights */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-dots [background-size:28px_28px] opacity-60" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-320px] h-[900px] w-[1100px] -translate-x-1/2 rounded-full bg-spotlight blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute right-[-200px] top-[400px] h-[700px] w-[700px] rounded-full bg-spotlight-violet blur-2xl" />

      {/* NAV */}
      <header className="sticky top-0 z-20 border-b border-line/60 bg-ink/70 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5">
          <a href="#top" className="flex items-center gap-2.5 text-fg no-underline">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-lime"><Bolt size={20} /></span>
            <span className="font-display text-lg font-extrabold tracking-tight">Viral AI Clipper</span>
          </a>
          <nav className="hidden gap-7 text-sm font-medium text-soft md:flex">
            <a href="#how" className="hover:text-fg">How it works</a>
            <a href="#clips" className="hover:text-fg">Your clips</a>
            <a href="#pricing" className="hover:text-fg">Pricing</a>
          </nav>
          <div className="flex items-center gap-2.5">
            {!isPro && <span className="hidden text-xs text-muted sm:inline">{freeLeft}/{FREE_DAILY_LIMIT} free today</span>}
            {isPro && (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-lime bg-lime-tint px-2.5 text-[11px] font-bold text-lime">
                <Bolt size={12} fill="#C6FF3D" />PRO
              </span>
            )}
            <button onClick={() => setShowPricing(true)} className="btn-lime h-10 px-4 text-sm">
              {isPro ? 'Manage' : 'Upgrade to Pro'}{!isPro && <Arrow />}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="relative mx-auto max-w-6xl px-5">
        {/* HERO */}
        <section className="grid items-center gap-12 pb-20 pt-16 md:grid-cols-[1.1fr_.9fr]">
          <div className="flex flex-col gap-6">
            <div className="inline-flex h-8 items-center gap-2 self-start rounded-full border border-line2 bg-surface pl-1.5 pr-3 text-[13px] font-medium text-soft">
              <span className="inline-flex h-[22px] items-center rounded-full bg-lime px-2 text-[11px] font-bold tracking-wide text-ink">NEW</span>
              Batch mode · paste up to 10 links at once
            </div>
            <h1 className="font-display text-[48px] font-extrabold leading-[.98] tracking-tight text-white md:text-[72px]">
              Turn one video into <span className="text-lime">ten clips</span> that actually go viral.
            </h1>
            <p className="max-w-[520px] text-lg leading-relaxed text-soft">
              Paste a YouTube, podcast or stream link. The AI finds the hooks, cuts the dead air, burns in captions and scores every clip for TikTok, Reels and Shorts.
            </p>

            {/* FORM */}
            <form onSubmit={handleClipping} className="flex flex-col gap-3.5 rounded-card border border-line2 bg-surface p-3.5 shadow-card">
              <label htmlFor="urls" className="px-1 text-xs font-semibold uppercase tracking-[.08em] text-muted">Video links</label>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch">
                <div className="flex flex-1 items-start gap-2.5 rounded-input border border-line2 bg-ink px-3.5 py-3 focus-within:border-lime">
                  <span className="mt-0.5"><Link /></span>
                  <textarea
                    id="urls"
                    value={videoUrl}
                    onChange={e => setVideoUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=…  (one per line for batch)"
                    rows={2}
                    required
                    className="min-w-0 flex-1 resize-none bg-transparent text-[15px] text-fg outline-none placeholder:text-muted"
                  />
                </div>
                <button type="submit" disabled={isProcessing} className="btn-lime h-[52px] whitespace-nowrap px-5 text-[15px]">
                  <Bolt /> {isProcessing ? 'Generating…' : 'Generate clips'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 px-0.5">
                <span className="mr-1 text-xs text-muted">Format</span>
                {FORMATS.map(f => (
                  <button key={f.value} type="button" onClick={() => setClipFormat(f.value)} className={`chip ${clipFormat === f.value ? 'chip-on' : ''}`}>{f.label}</button>
                ))}
                <span className="mx-1.5 hidden h-5 w-px bg-line2 sm:block" />
                <span className="mr-1 text-xs text-muted">Style</span>
                {STYLES.map(s => (
                  <button key={s.value} type="button" onClick={() => setAiStyle(s.value)} className={`chip ${aiStyle === s.value ? 'chip-on' : ''}`}>{s.label}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-0.5 text-xs text-muted">
                <div className="flex gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-soft"><input type="checkbox" className="accent-lime" checked={autoSubtitles} onChange={e => setAutoSubtitles(e.target.checked)} /> Captions</label>
                  <label className="flex cursor-pointer items-center gap-2 text-soft"><input type="checkbox" className="accent-lime" checked={aiHook} onChange={e => setAiHook(e.target.checked)} /> Hook overlay</label>
                </div>
                {!isPro && (
                  <span className="flex items-center gap-2">
                    {freeLeft} free generation{freeLeft === 1 ? '' : 's'} left today
                    <span className="inline-flex gap-1">
                      {Array.from({ length: FREE_DAILY_LIMIT }, (_, i) => (
                        <i key={i} className={`h-1 w-7 rounded-sm ${i < freeLeft ? 'bg-lime' : 'bg-line2'}`} />
                      ))}
                    </span>
                  </span>
                )}
              </div>
            </form>

            <div className="flex flex-wrap gap-5 text-[13px] text-muted">
              <span className="flex items-center gap-1.5"><Check />No watermark on Pro</span>
              <span className="flex items-center gap-1.5"><Check />Captions burned in</span>
              <span className="flex items-center gap-1.5"><Check />Ready in ~90s</span>
            </div>
          </div>

          {/* Hero visual */}
          <div className="relative hidden h-[560px] items-center justify-center md:flex">
            <div aria-hidden className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-line2" />
            <div aria-hidden className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-line" />

            {/* back phone */}
            <div className="absolute left-[30px] top-[90px] h-[360px] w-[200px] -rotate-[8deg] rounded-[28px] border border-line bg-surface shadow-card animate-floaty-slow">
              <div className="absolute inset-3.5 overflow-hidden rounded-[18px] bg-[#1E1E29]">
                <div className="absolute inset-x-3.5 bottom-10 rounded-[10px] bg-ink/85 px-2.5 py-2 font-display text-sm font-extrabold uppercase leading-[1.1] text-white">
                  nobody<br /><span className="text-lime">talks about this</span>
                </div>
              </div>
            </div>

            {/* front phone */}
            <div className="relative h-[430px] w-[240px] rounded-[32px] border border-line2 bg-surface shadow-[0_40px_90px_rgba(0,0,0,.7),0_0_0_6px_rgba(198,255,61,.08)] animate-floaty">
              <div className="absolute inset-3.5 overflow-hidden rounded-[22px] bg-[#0F0F16]">
                <div className="absolute inset-x-0 top-0 h-[40%] bg-[#1A1A24]" />
                <div className="wave absolute inset-x-4 top-1/2 flex h-10 items-end gap-1" aria-hidden>
                  {Array.from({ length: 22 }, (_, i) => <span key={i} className="h-10" style={{ animationDelay: `${(i * 137) % 1100}ms` }} />)}
                </div>
                <div className="absolute inset-x-3.5 bottom-14 text-center font-display text-lg font-extrabold uppercase leading-[1.05] text-white [text-shadow:0_2px_12px_rgba(0,0,0,.8)]">
                  I spent <span className="rounded bg-lime/15 px-1 text-lime">$40,000</span> on this mistake
                </div>
                <div className="absolute inset-x-3.5 bottom-[18px] flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted">00:42 / 01:00</span>
                  <span className="inline-flex gap-1"><i className="h-1.5 w-1.5 rounded-full bg-lime" /><i className="h-1.5 w-1.5 rounded-full bg-line2" /><i className="h-1.5 w-1.5 rounded-full bg-line2" /></span>
                </div>
                <div className="absolute left-3.5 top-3.5 inline-flex h-6 items-center gap-1.5 rounded-full border border-line2 bg-ink/80 px-2 text-[11px] font-semibold"><i className="h-1.5 w-1.5 rounded-full bg-hot" />9:16</div>
              </div>
            </div>

            {/* score badge */}
            <div className="card absolute right-[10px] top-[70px] flex items-center gap-3.5 px-4 py-3.5 shadow-card animate-floaty-slow">
              <ViralScoreMeter score={94} size={64} stroke={10} />
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">Viral score</span>
                <span className="font-display text-lg font-extrabold text-lime">Post this one</span>
                <span className="text-xs text-soft">Strong hook · tight pacing</span>
              </div>
            </div>

            {/* hook badge */}
            <div className="card absolute bottom-10 left-0 flex items-center gap-3 px-3.5 py-3 shadow-card animate-floaty">
              <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-violet"><Sparkle color="#fff" /></span>
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">AI hook</span>
                <span className="text-sm font-semibold">“Wait for the plot twist at 0:31”</span>
              </div>
            </div>

            {/* platform badge */}
            <div className="card absolute bottom-[90px] right-[30px] flex items-center gap-2 px-3 py-2.5 shadow-card">
              {['TT', 'IG', 'YT'].map(p => <span key={p} className="grid h-[26px] w-[26px] place-items-center rounded-lg border border-line2 bg-ink text-[10px] font-bold">{p}</span>)}
              <span className="ml-1 text-xs text-soft">Export to all three</span>
            </div>
          </div>
        </section>
      </main>

      {/* MARQUEE */}
      <div aria-hidden className="relative overflow-hidden border-y border-[#1E1E29] bg-[#0D0D14] py-3.5">
        <div className="flex w-max gap-4 animate-marquee">
          {[...HOOKS, ...HOOKS].map((h, i) => <span key={i} className="chip cursor-default hover:border-line2">{h}</span>)}
        </div>
      </div>

      <main className="relative mx-auto max-w-6xl px-5">
        {/* STATUS / RESULTS */}
        <section id="clips" className="flex flex-col gap-8 pb-20 pt-20">
          {isProcessing && (
            <div className="card flex flex-col gap-4 p-5 animate-fadeup">
              <div className="flex items-center gap-3.5 rounded-[14px] border border-line bg-[#0F0F16] p-3.5">
                <svg className="animate-spin" width="40" height="40" viewBox="0 0 40 40" aria-hidden><circle cx="20" cy="20" r="16" fill="none" stroke="#23232E" strokeWidth="5" /><path d="M20 4a16 16 0 0 1 16 16" fill="none" stroke="#C6FF3D" strokeWidth="5" strokeLinecap="round" /></svg>
                <div className="flex flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold">{statusMessage}</span>
                  <span className="text-xs text-muted">Step {stage + 1} of 4 · usually under 90 seconds</span>
                </div>
                <div className="wave hidden h-7 items-end gap-1 sm:flex" aria-hidden>
                  {Array.from({ length: 5 }, (_, i) => <span key={i} className="h-7" style={{ animationDelay: `${i * 150}ms` }} />)}
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#1E1E29]">
                <i className="block h-full rounded-full bg-lime transition-[width] duration-700" style={{ width: `${(stage + 1) * 25}%` }} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex flex-col gap-2">
                    <div className="aspect-[9/12] rounded-xl bg-shimmer [background-size:200%_100%] animate-shimmer" style={{ animationDelay: `${i * 200}ms` }} />
                    <div className="h-2.5 w-4/5 rounded bg-shimmer [background-size:200%_100%] animate-shimmer" />
                    <div className="h-2.5 w-1/2 rounded bg-shimmer [background-size:200%_100%] animate-shimmer" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isProcessing && clips.length === 0 && (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-card border border-dashed border-line2 p-8 text-center">
              <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Empty clip tray" className="animate-floaty">
                <rect x="28" y="18" width="40" height="70" rx="10" fill="#1E1E29" stroke="#2A2A36" />
                <rect x="52" y="30" width="40" height="70" rx="10" fill="#14141C" stroke="#2A2A36" />
                <rect x="60" y="42" width="24" height="4" rx="2" fill="#2A2A36" /><rect x="60" y="52" width="18" height="4" rx="2" fill="#2A2A36" />
                <circle cx="36" cy="92" r="14" fill="#C6FF3D" /><path d="M31 92h10M36 87v10" stroke="#0A0A0F" strokeWidth="3" strokeLinecap="round" />
                <path d="M96 20l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="#7C5CFF" />
              </svg>
              <h3 className="font-display text-2xl font-extrabold text-white">No clips yet</h3>
              <p className="max-w-[300px] text-sm leading-relaxed text-soft">Paste a link above and the AI will pull the best 30–60 second moments out of it.</p>
              <button type="button" onClick={() => { setVideoUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="btn-ghost h-11 px-5 text-sm">Try a sample link</button>
            </div>
          )}

          {!isProcessing && clips.length > 0 && (
            <>
              {justFinished && (
                <div className="relative flex items-center gap-4 overflow-hidden rounded-card border border-lime bg-lime-tint p-4 animate-fadeup">
                  <div aria-hidden className="pointer-events-none absolute inset-0">
                    {['12%', '28%', '44%', '60%', '76%', '90%'].map((l, i) => (
                      <i key={i} className="absolute -top-2 h-3 w-2 rounded-sm animate-confetti" style={{ left: l, background: ['#C6FF3D', '#7C5CFF', '#FF4D6D', '#FFB64D'][i % 4], animationDelay: `${i * 0.25}s` }} />
                    ))}
                  </div>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-lime shadow-glow animate-pop"><Check color="#0A0A0F" /></span>
                  <div className="relative">
                    <p className="font-display text-lg font-extrabold text-white">{clips.length} clips ready</p>
                    <p className="text-sm text-soft">Top score <span className="font-mono text-lime">{topScore}</span> — sorted best first.</p>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-2">
                  <span className="eyebrow">Your clips</span>
                  <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-white md:text-[44px]">Ranked by how likely they are to blow up.</h2>
                </div>
                <button onClick={() => setClips([])} className="btn-ghost h-10 px-4 text-sm">Clear</button>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {clips.map((c, i) => <ClipPlayer key={`${c.id}-${i}`} clip={c} />)}
              </div>
            </>
          )}

          {history.length > 0 && (
            <div className="flex flex-col gap-3 pt-4">
              <span className="text-xs font-semibold uppercase tracking-[.08em] text-muted">Recent</span>
              <div className="flex flex-col gap-2">
                {history.map(h => (
                  <div key={h.id} className="flex items-center justify-between gap-3 rounded-input border border-line bg-surface px-3.5 py-2.5 text-sm">
                    <span className="truncate text-soft">{h.url}</span>
                    <span className="hidden shrink-0 text-xs text-muted sm:inline">{h.clips?.length || 0} clips</span>
                    <button onClick={() => { setVideoUrl(h.url); setClips(h.clips); }} className="shrink-0 text-xs font-semibold text-lime hover:text-lime-hover">Load</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="flex flex-col gap-10 pb-24">
          <div className="flex max-w-[640px] flex-col gap-3">
            <span className="eyebrow">How it works</span>
            <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-white md:text-[44px]">Paste. Pick a style. Post.</h2>
            <p className="text-base leading-relaxed text-soft">Three steps, about ninety seconds. No timeline, no scrubbing, no caption typing.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { n: '01', icon: <Link color="#C6FF3D" />, title: 'Paste your links', desc: 'Drop one URL or a whole list. YouTube, Twitch VODs, podcasts, Zoom recordings — anything with a link.' },
              { n: '02', icon: <Sparkle />, title: 'AI finds the moments', desc: 'It transcribes, scores every segment for hook strength and pacing, then cuts the top clips and writes the opening line.' },
              { n: '03', icon: <Download />, title: 'Export & post', desc: 'Captions burned in, hook on screen, sized for 9:16, 16:9 or 1:1. Copy the caption and go.' },
            ].map(s => (
              <article key={s.n} className="card flex flex-col gap-4 p-7 transition hover:-translate-y-1 hover:border-lime">
                <div className="flex items-center justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-[14px] border border-line2 bg-ink">{s.icon}</span>
                  <span className="font-mono text-xs text-muted">{s.n}</span>
                </div>
                <h3 className="font-display text-[22px] font-extrabold text-white">{s.title}</h3>
                <p className="text-sm leading-relaxed text-soft">{s.desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="flex flex-col items-center gap-9 pb-28">
          <div className="flex max-w-[640px] flex-col items-center gap-3 text-center">
            <span className="eyebrow">Pricing</span>
            <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-white md:text-[44px]">{FREE_DAILY_LIMIT} clips a day free. Unlimited on Pro.</h2>
            <div className="mt-2 inline-flex rounded-full border border-line2 bg-surface p-1">
              <button type="button" onClick={() => setBilling('monthly')} className={`chip h-[34px] border-0 ${billing === 'monthly' ? 'chip-on' : ''}`}>Monthly</button>
              <button type="button" onClick={() => setBilling('yearly')} className={`chip h-[34px] border-0 ${billing === 'yearly' ? 'chip-on' : ''}`}>
                Yearly <span className="ml-1 inline-flex h-5 items-center rounded-full bg-lime px-1.5 text-[11px] font-bold text-ink">−43%</span>
              </button>
            </div>
          </div>
          <div className="grid w-full max-w-[860px] gap-5 md:grid-cols-2">
            <article className="card flex flex-col gap-5 p-8">
              <div className="flex flex-col gap-1.5">
                <span className="font-display text-xl font-extrabold">Free</span>
                <span className="text-sm text-muted">Try it on your next upload.</span>
              </div>
              <div className="flex items-baseline gap-1.5"><span className="font-display text-[52px] font-extrabold leading-none text-white">$0</span><span className="text-sm text-muted">forever</span></div>
              <ul className="flex flex-col gap-2.5 text-sm text-soft">
                <li className="flex items-center gap-2.5"><Check color="#8A8AA0" />{FREE_DAILY_LIMIT} generations per day</li>
                <li className="flex items-center gap-2.5"><Check color="#8A8AA0" />Basic styles</li>
                <li className="flex items-center gap-2.5"><Check color="#8A8AA0" />Watermarked exports</li>
              </ul>
              <a href="#top" className="btn-ghost mt-auto h-12 no-underline">Start free</a>
            </article>
            <article className="card relative flex flex-col gap-5 border-lime p-8 shadow-pro">
              <span className="absolute -top-3.5 left-8 inline-flex h-7 items-center gap-1.5 rounded-full bg-lime px-3 text-xs font-bold tracking-wide text-ink"><Bolt size={14} />MOST POPULAR</span>
              <div className="flex flex-col gap-1.5">
                <span className="font-display text-xl font-extrabold text-lime">Pro</span>
                <span className="text-sm text-muted">For creators posting daily.</span>
              </div>
              <div className="flex items-baseline gap-1.5"><span className="font-display text-[52px] font-extrabold leading-none text-white">{price.amount}</span><span className="text-sm text-muted">{price.per}</span></div>
              <ul className="flex flex-col gap-2.5 text-sm text-fg">
                <li className="flex items-center gap-2.5"><Check />Unlimited generations</li>
                <li className="flex items-center gap-2.5"><Check />All AI styles</li>
                <li className="flex items-center gap-2.5"><Check />No watermark</li>
                <li className="flex items-center gap-2.5"><Check />Batch up to 10 links</li>
                <li className="flex items-center gap-2.5"><Check />CSV export + priority</li>
              </ul>
              <button onClick={() => handleUpgrade(price.plan)} className="btn-lime mt-auto h-12">
                {isPro ? 'You’re on Pro' : 'Upgrade to Pro'}{!isPro && <Arrow />}
              </button>
              <span className="text-center text-xs text-muted">Cancel anytime · Secure checkout via Stripe</span>
            </article>
          </div>
        </section>
      </main>

      {/* UPGRADE MODAL */}
      {showPricing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm" onClick={() => setShowPricing(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="up-title" className="relative w-full max-w-[560px] overflow-hidden rounded-3xl border border-line2 bg-surface shadow-modal animate-fadeup" onClick={e => e.stopPropagation()}>
            <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-spotlight blur-xl" />
            <div className="relative flex flex-col gap-5 p-7">
              <div className="flex items-start justify-between gap-3">
                {!isPro && dailyCount >= FREE_DAILY_LIMIT ? (
                  <span className="inline-flex h-8 items-center gap-2 rounded-full border border-hot bg-[#2A1414] px-2.5 text-xs font-semibold text-[#FF8FA3]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v6M12 16v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    You've used {FREE_DAILY_LIMIT} of {FREE_DAILY_LIMIT} free clips today
                  </span>
                ) : <span className="eyebrow pt-2">Pro</span>}
                <button type="button" aria-label="Close" onClick={() => setShowPricing(false)} className="btn-ghost h-9 w-9 rounded-[10px] p-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
                </button>
              </div>
              <h3 id="up-title" className="font-display text-3xl font-extrabold leading-tight tracking-tight text-white md:text-[38px]">
                Keep the clips coming.<br /><span className="text-lime">Go unlimited.</span>
              </h3>
              <p className="text-[15px] leading-relaxed text-soft">Pro removes the daily cap and the watermark, unlocks every AI style, and saves your history so you never lose a banger.</p>
              <ul className="grid gap-2.5 text-sm sm:grid-cols-2">
                <li className="flex items-center gap-2"><Check />Unlimited generations</li>
                <li className="flex items-center gap-2"><Check />No watermark</li>
                <li className="flex items-center gap-2"><Check />Batch up to 10 links</li>
                <li className="flex items-center gap-2"><Check />All AI styles</li>
              </ul>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <button onClick={() => handleUpgrade('pro_yearly')} className="btn-lime h-[50px] flex-1 text-[15px]">$199 / year <span className="rounded-full bg-ink/15 px-1.5 text-[11px]">save 43%</span></button>
                <button onClick={() => handleUpgrade('pro_monthly')} className="btn-ghost h-[50px] flex-1 text-[15px]">$29 / month</button>
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Secure checkout via Stripe · cancel anytime</span>
                <button onClick={unlockPro} className="text-muted/70 hover:text-muted">Demo unlock (local)</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="relative border-t border-[#1E1E29] bg-[#0D0D14]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-[13px] text-muted">
          <span className="flex items-center gap-2"><span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-lime"><Bolt size={13} /></span>Viral AI Clipper © {new Date().getFullYear()}</span>
          <span className="flex gap-5"><a href="#" className="hover:text-fg">Terms</a><a href="#" className="hover:text-fg">Privacy</a><a href="#" className="hover:text-fg">Support</a></span>
        </div>
      </footer>
    </div>
  );
}
