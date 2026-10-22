'use client';

import { useState, useEffect } from 'react';
import ClipPlayer from '../components/ClipPlayer';

const FREE_DAILY_LIMIT = 3;

export default function Home() {
  const [videoUrl, setVideoUrl] = useState('');
  const [clipFormat, setClipFormat] = useState('shorts_9_16');
  const [aiStyle, setAiStyle] = useState('character_swap');
  const [autoSubtitles, setAutoSubtitles] = useState(true);
  const [aiHook, setAiHook] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [clips, setClips] = useState([]);
  const [history, setHistory] = useState([]);
  const [showPricing, setShowPricing] = useState(false);
  const [dailyCount, setDailyCount] = useState(0);
  const [isPro, setIsPro] = useState(false); // later from auth/subscription

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
    const stages = ['Initializing…', 'Analyzing audio…', 'Generating prompts…', 'Rendering clips…'];
    let i = 0;
    setStatusMessage(stages[0]);
    const id = setInterval(() => { i = (i + 1) % stages.length; setStatusMessage(stages[i]); }, 1000);
    return () => clearInterval(id);
  }, [isProcessing]);

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

    const urls = videoUrl.split(',').map(u => u.trim()).filter(Boolean);
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
          title: `[${url.slice(0, 18)}…] ${c.title}`
        }));
        all = [...all, ...batch];
      }
      setClips(all);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      <header className="border-b border-slate-800/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <h1 className="text-xl font-bold">Viral AI Clipper</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {!isPro && <span className="text-slate-400">{dailyCount}/{FREE_DAILY_LIMIT} free today</span>}
            {isPro && <span className="text-emerald-400 font-medium">Pro</span>}
            <button onClick={() => setShowPricing(true)} className="px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-sm">
              {isPro ? 'Manage' : 'Upgrade'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        {/* Hero */}
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white to-indigo-300 bg-clip-text text-transparent">
            Turn long videos into viral shorts
          </h2>
          <p className="mt-3 text-slate-400 max-w-xl mx-auto">
            Batch-generate TikTok, Reels, and Shorts clips with AI captions, hooks, and restyles.
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-4 mb-12">
          {[
            { title: 'Batch Processing', desc: 'Paste multiple URLs and generate everything at once.' },
            { title: 'AI Restyles', desc: 'Character swap, anime, 3D kids, or clean 4K looks.' },
            { title: 'Captions + Hooks', desc: 'Auto animated subtitles and viral intro overlays.' },
          ].map(f => (
            <div key={f.title} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <h3 className="font-medium">{f.title}</h3>
              <p className="text-sm text-slate-400 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleClipping} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <textarea
            value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            placeholder="Paste video URLs (comma-separated for batch)..."
            rows={3}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            required
          />
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="text-xs text-slate-400">Format</label>
              <select value={clipFormat} onChange={e => setClipFormat(e.target.value)} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                <option value="shorts_9_16">9:16 Shorts / TikTok / Reels</option>
                <option value="landscape_16_9">16:9 Landscape</option>
                <option value="square_1_1">1:1 Square</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400">AI Style</label>
              <select value={aiStyle} onChange={e => setAiStyle(e.target.value)} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                <option value="character_swap">🎭 Character Swap</option>
                <option value="anime_action">⚡ Anime Action</option>
                <option value="kids_3d">🦖 3D Kids</option>
                <option value="clean_viral">🎬 Clean 4K</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={autoSubtitles} onChange={e => setAutoSubtitles(e.target.checked)} /> Captions</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={aiHook} onChange={e => setAiHook(e.target.checked)} /> Hook overlay</label>
          </div>
          <button type="submit" disabled={isProcessing} className="mt-5 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium">
            {isProcessing ? 'Generating…' : isPro ? 'Generate Clips' : `Generate (${FREE_DAILY_LIMIT - dailyCount} free left)`}
          </button>
        </form>

        {isProcessing && <div className="mt-4 text-center text-sm text-indigo-300">{statusMessage}</div>}

        {clips.length > 0 && (
          <div className="mt-10">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Generated Clips ({clips.length})</h3>
              <button onClick={() => setClips([])} className="text-xs text-slate-400">Clear</button>
            </div>
            <div className="space-y-3">{clips.map((c, i) => <ClipPlayer key={c.id + i} clip={c} />)}</div>
          </div>
        )}

        {/* Pricing section */}
        <section className="mt-16">
          <h3 className="text-2xl font-bold text-center mb-6">Simple pricing</h3>
          <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
            <div className="border border-slate-800 rounded-2xl p-6 bg-slate-900/40">
              <h4 className="font-medium">Free</h4>
              <p className="text-3xl font-bold mt-2">$0</p>
              <ul className="text-sm text-slate-400 mt-4 space-y-1">
                <li>• {FREE_DAILY_LIMIT} generations / day</li>
                <li>• Basic styles</li>
                <li>• Watermarked exports</li>
              </ul>
            </div>
            <div className="border border-indigo-600 rounded-2xl p-6 bg-indigo-950/30 relative">
              <div className="absolute -top-3 right-4 bg-indigo-600 text-xs px-2 py-0.5 rounded-full">Popular</div>
              <h4 className="font-medium">Pro</h4>
              <p className="text-3xl font-bold mt-2">$29<span className="text-base font-normal text-slate-400">/mo</span></p>
              <ul className="text-sm text-slate-300 mt-4 space-y-1">
                <li>• Unlimited generations</li>
                <li>• All AI styles</li>
                <li>• No watermark</li>
                <li>• CSV export + priority</li>
              </ul>
              <button onClick={() => handleUpgrade('pro_monthly')} className="mt-5 w-full py-2.5 rounded-xl bg-indigo-600 font-medium">Start Pro</button>
            </div>
          </div>
        </section>

        {history.length > 0 && (
          <div className="mt-12">
            <h3 className="text-sm text-slate-400 mb-3">Recent</h3>
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.id} className="flex justify-between bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2 text-sm">
                  <span className="truncate text-slate-300 max-w-md">{h.url}</span>
                  <button onClick={() => { setVideoUrl(h.url); setClips(h.clips); }} className="text-xs text-indigo-400">Load</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {showPricing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowPricing(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-1">Upgrade to Pro</h3>
            <p className="text-sm text-slate-400 mb-4">Unlimited generations, all styles, no watermark.</p>
            <button onClick={() => handleUpgrade('pro_monthly')} className="w-full py-3 rounded-xl bg-indigo-600 font-medium mb-2">$29 / month</button>
            <button onClick={() => handleUpgrade('pro_yearly')} className="w-full py-3 rounded-xl bg-slate-800 font-medium">$199 / year</button>
            <button onClick={unlockPro} className="mt-3 text-xs text-slate-500 w-full">Demo unlock (local)</button>
            <button onClick={() => setShowPricing(false)} className="mt-2 text-xs text-slate-500 w-full">Close</button>
          </div>
        </div>
      )}

      <footer className="mt-20 border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        Viral AI Clipper · Next.js on Vercel
      </footer>
    </div>
  );
}
