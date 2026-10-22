'use client';

import { useState } from 'react';

export default function ChannelPage() {
  const [channel, setChannel] = useState('');
  const [videos, setVideos] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function lookup(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message || 'Lookup failed'); setVideos([]); return; }
      setVideos(data.videos || []);
      localStorage.setItem('viral_channel', channel);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink text-fg">
      <header className="sticky top-0 z-20 border-b border-line/60 bg-ink/70 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5">
          <a href="/" className="flex items-center gap-2.5 text-fg no-underline">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-lime text-ink font-extrabold">V</span>
            <span className="font-display text-lg font-extrabold tracking-tight">Viral AI Clipper</span>
          </a>
          <nav className="flex gap-6 text-sm font-medium text-soft">
            <a href="/" className="hover:text-fg">Home</a>
            <a href="/tools" className="hover:text-fg">AI Tools</a>
            <a href="/assets" className="hover:text-fg">My Assets</a>
            <a href="/channel" className="text-lime">Channel</a>
          </nav>
        </div>
      </header>
      <section className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-10">
        <span className="eyebrow">Auto-clip</span>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-white md:text-[44px]">Clip a channel</h1>
        <p className="text-sm text-soft">Paste a YouTube channel URL. Pick a new upload and clip it without hunting for the link.</p>
        <form onSubmit={lookup} className="flex flex-col gap-3 sm:flex-row">
          <input value={channel} onChange={e => setChannel(e.target.value)} placeholder="https://www.youtube.com/channel/UC..." className="flex-1 rounded-input border border-line2 bg-ink px-3 py-3 text-sm outline-none focus:border-lime" />
          <button type="submit" disabled={busy} className="btn-lime h-12 px-5 text-sm">{busy ? 'Looking…' : 'Find uploads'}</button>
        </form>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex flex-col gap-3">
          {videos.map(v => (
            <a key={v.id} href={`/?url=${encodeURIComponent(v.url)}`} className="card flex items-center justify-between gap-3 px-4 py-3 no-underline">
              <span className="text-sm text-white">{v.title}</span>
              <span className="text-xs font-semibold text-lime">Clip</span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
