'use client';

import { useEffect, useState } from 'react';

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState([]);
  const [account, setAccount] = useState({ youtube: false });

  useEffect(() => {
    fetch('/api/connectors', { cache: 'no-store' }).then(r => r.json()).then(d => { setConnectors(d.connectors || []); setAccount(d.account || {}); }).catch(() => {});
  }, []);

  const groups = connectors.reduce((acc, c) => {
    acc[c.category] = acc[c.category] || [];
    acc[c.category].push(c);
    return acc;
  }, {});
  const badge = c => c.kind === 'coming' ? ['Coming soon', 'text-muted']
    : c.kind === 'direct' ? (account.youtube ? ['Channel connected', 'text-lime'] : ['Not connected', 'text-hot'])
    : c.kind === 'open' ? ['Opens app · caption copied', 'text-soft'] : ['Available', 'text-lime'];

  return (
    <main className="min-h-screen bg-ink text-fg">
      <header className="sticky top-0 z-20 border-b border-line/60 bg-ink/70 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-3 px-5">
          <a href="/" className="flex items-center gap-2.5 text-fg no-underline">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-lime text-ink font-extrabold">V</span>
            <span className="hidden font-display text-lg font-extrabold tracking-tight sm:inline">Viral AI Clipper</span>
          </a>
          <nav className="flex gap-4 text-sm font-medium text-soft sm:gap-6">
            <a href="/studio" className="hover:text-fg">Studio</a>
            <a href="/assets" className="hover:text-fg">My Assets</a>
          </nav>
        </div>
      </header>
      <section className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-10">
        <span className="eyebrow">Connections</span>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-white md:text-[44px]">Where clips come from and go</h1>
        <p className="text-sm text-soft">Three ways to publish: <b className="text-white">direct upload</b> (YouTube Shorts, after you connect your channel), <b className="text-white">download</b> the MP4 and post it anywhere, or <b className="text-white">open the app</b> with your caption already copied (TikTok, Reels, X).</p>
        {Object.entries(groups).map(([category, items]) => (
          <div key={category} className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[.1em] text-muted">{category}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map(c => {
                const [text, cls] = badge(c);
                return (
                  <div key={c.id} className={`card flex flex-col gap-2 p-4 ${c.kind === 'coming' ? 'opacity-70' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white">{c.name}</span>
                      <span className={`text-right text-[11px] font-bold uppercase ${cls}`}>{text}</span>
                    </div>
                    <p className="text-sm text-soft">{c.description}</p>
                    {c.kind === 'direct' && !account.youtube && <a href="/api/youtube/start?next=/connectors" className="btn-lime mt-1 h-9 self-start px-3 text-xs no-underline">Connect YouTube</a>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
