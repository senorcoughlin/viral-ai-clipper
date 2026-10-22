'use client';

import { useState, useEffect } from 'react';
import ClipPlayer from '../components/ClipPlayer';

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

  useEffect(() => {
    const saved = localStorage.getItem('viral_clipper_history');
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch {}
    }
  }, []);

  useEffect(() => {
    if (history.length) localStorage.setItem('viral_clipper_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (!isProcessing) return;
    const stages = [
      'Initializing batch queue...',
      'Connecting to AI servers...',
      'Analyzing audio & sentiment...',
      'Generating restyle prompts...',
      'Rendering crops & captions...'
    ];
    let i = 0;
    setStatusMessage(stages[0]);
    const id = setInterval(() => {
      i = (i + 1) % stages.length;
      setStatusMessage(stages[i]);
    }, 1200);
    return () => clearInterval(id);
  }, [isProcessing]);

  const handleClipping = async (e) => {
    e.preventDefault();
    if (!videoUrl.trim()) return;
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
          title: `[${url.slice(0, 20)}...] ${c.title}`
        }));
        all = [...all, ...batch];
      }
      setClips(all);
      setHistory(prev => [{ id: Date.now(), url: videoUrl, format: clipFormat, aiStyle, clips: all }, ...prev].slice(0, 5));
    } catch (err) {
      alert('Error processing batch. Try again.');
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      <header className="border-b border-slate-800/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <h1 className="text-xl font-bold tracking-tight">Viral AI Clipper</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowPricing(true)} className="px-4 py-1.5 text-sm rounded-full bg-indigo-600 hover:bg-indigo-500 transition">
              Upgrade to Pro
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="text-center mb-10">
          <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white to-indigo-300 bg-clip-text text-transparent">
            Turn long videos into viral shorts
          </h2>
          <p className="mt-3 text-slate-400 max-w-xl mx-auto">
            Paste one or more URLs. Get batch-generated clips with captions, hooks, and AI restyles in seconds.
          </p>
        </div>

        <form onSubmit={handleClipping} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <textarea
            value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            placeholder="Paste YouTube, TikTok, or other video URLs (comma-separated for batch)..."
            rows={3}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            required
          />

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="text-xs font-medium text-slate-400">Output Format</label>
              <select value={clipFormat} onChange={e => setClipFormat(e.target.value)} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                <option value="shorts_9_16">9:16 Shorts / TikTok / Reels</option>
                <option value="landscape_16_9">16:9 Landscape</option>
                <option value="square_1_1">1:1 Square</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400">AI Style</label>
              <select value={aiStyle} onChange={e => setAiStyle(e.target.value)} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                <option value="character_swap">🎭 Character Swap & Lip-Sync</option>
                <option value="anime_action">⚡ Anime Action</option>
                <option value="kids_3d">🦖 3D Kids / Cute</option>
                <option value="clean_viral">🎬 Clean 4K Studio</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={autoSubtitles} onChange={e => setAutoSubtitles(e.target.checked)} className="rounded" />
              Animated captions
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={aiHook} onChange={e => setAiHook(e.target.checked)} className="rounded" />
              Viral hook overlay
            </label>
          </div>

          <button
            type="submit"
            disabled={isProcessing}
            className="mt-5 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium transition"
          >
            {isProcessing ? 'Generating…' : 'Generate Clips'}
          </button>
        </form>

        {isProcessing && (
          <div className="mt-4 text-center text-sm text-indigo-300 animate-pulse">{statusMessage}</div>
        )}

        {clips.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Generated Clips ({clips.length})</h3>
              <button onClick={() => setClips([])} className="text-xs text-slate-400 hover:text-white">Clear</button>
            </div>
            <div className="space-y-3">
              {clips.map((c, i) => <ClipPlayer key={c.id + '-' + i} clip={c} />)}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-12">
            <h3 className="text-sm font-medium text-slate-400 mb-3">Recent Sessions</h3>
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.id} className="flex items-center justify-between bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2 text-sm">
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
            <h3 className="text-xl font-bold mb-2">Go Pro</h3>
            <p className="text-sm text-slate-400 mb-4">Unlimited generations, higher quality, priority processing, and CSV export.</p>
            <div className="space-y-2">
              <button onClick={() => handleUpgrade('pro_monthly')} className="w-full py-3 rounded-xl bg-indigo-600 font-medium">$29 / month</button>
              <button onClick={() => handleUpgrade('pro_yearly')} className="w-full py-3 rounded-xl bg-slate-800 font-medium">$199 / year (save 40%)</button>
            </div>
            <button onClick={() => setShowPricing(false)} className="mt-4 text-xs text-slate-500 w-full">Close</button>
          </div>
        </div>
      )}

      <footer className="mt-20 border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        Viral AI Clipper · Built with Next.js on Vercel
      </footer>
    </div>
  );
}
