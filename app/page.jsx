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
  const [isPro, setIsPro] = useState(false);
  const [proEmail, setProEmail] = useState('');

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
    const email = localStorage.getItem('viral_pro_email') || '';
    setIsPro(pro);
    setProEmail(email);
  }, []);

  useEffect(() => {
    if (history.length) localStorage.setItem('viral_clipper_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (!isProcessing) return;
    const stages = ['Analyzing video…', 'Finding viral moments…', 'Generating hooks…', 'Rendering clips…'];
    let i = 0;
    setStatusMessage(stages[0]);
    const id = setInterval(() => { i = (i + 1) % stages.length; setStatusMessage(stages[i]); }, 1200);
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
        all = [...all, ...(result.data?.clips || [])];
      }
      setClips(all);
      setHistory(prev => [{ id: Date.now(), url: videoUrl, clips: all, at: new Date().toISOString() }, ...prev].slice(0, 20));
      if (!isPro) incrementDaily();
    } catch (err) {
      setStatusMessage(err.message || 'Generation failed');
    } finally {
      setIsProcessing(false);
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
      if (data.success && data.data?.checkoutUrl) {
        window.location.href = data.data.checkoutUrl;
      }
    } catch {}
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      <header className="border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-20 bg-slate-950/70">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold">V</div>
            <span className="font-semibold tracking-tight">Viral AI Clipper</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {isPro ? (
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-medium">Pro {proEmail && `· ${proEmail}`}</span>
            ) : (
              <span className="text-slate-400">{dailyCount}/{FREE_DAILY_LIMIT} free today</span>
            )}
            <button onClick={() => setShowPricing(true)} className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition">
              {isPro ? 'Manage' : 'Upgrade'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent mb-3">
            Turn any video into viral clips
          </h1>
          <p className="text-slate-400 text-lg">Paste a URL. Get short-form clips with hooks, captions, and style — in seconds.</p>
        </div>

        <form onSubmit={handleClipping} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mb-8 backdrop-blur-sm">
          <textarea
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Paste YouTube, TikTok, or direct video URLs (comma-separated for batch)"
            className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px]"
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <select value={clipFormat} onChange={(e) => setClipFormat(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm">
              <option value="shorts_9_16">9:16 Shorts</option>
              <option value="landscape_16_9">16:9</option>
              <option value="square_1_1">1:1</option>
            </select>
            <select value={aiStyle} onChange={(e) => setAiStyle(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm">
              <option value="character_swap">Character Swap</option>
              <option value="cinematic">Cinematic</option>
              <option value="meme">Meme Style</option>
              <option value="podcast">Podcast Clip</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={autoSubtitles} onChange={(e) => setAutoSubtitles(e.target.checked)} /> Subtitles
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={aiHook} onChange={(e) => setAiHook(e.target.checked)} /> AI Hook
            </label>
          </div>
          <button
            type="submit"
            disabled={isProcessing}
            className="mt-4 w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 font-medium hover:opacity-90 disabled:opacity-50 transition"
          >
            {isProcessing ? statusMessage : 'Generate Clips'}
          </button>
        </form>

        {clips.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4 mb-10">
            {clips.map((clip, i) => <ClipPlayer key={i} clip={clip} />)}
          </div>
        )}

        {history.length > 0 && (
          <div>
            <h3 className="text-sm text-slate-400 mb-3">Recent</h3>
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.id} className="flex justify-between items-center bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2 text-sm">
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
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-1">Go Pro</h2>
            <p className="text-slate-400 text-sm mb-5">Unlimited generations, priority processing, and no watermarks.</p>
            <button onClick={() => handleUpgrade('pro_monthly')} className="w-full py-3 rounded-xl bg-indigo-600 font-medium mb-2 hover:bg-indigo-500">$29 / month</button>
            <button onClick={() => handleUpgrade('pro_yearly')} className="w-full py-3 rounded-xl bg-slate-800 font-medium hover:bg-slate-700">$199 / year</button>
            <button onClick={() => setShowPricing(false)} className="mt-3 text-xs text-slate-500 w-full">Close</button>
          </div>
        </div>
      )}

      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        Viral AI Clipper · Next.js on Vercel
      </footer>
    </div>
  );
}
