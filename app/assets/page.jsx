'use client';

import { useEffect, useState } from 'react';
import ClipPlayer from '../../components/ClipPlayer';
import AccountBar, { readSession } from '../../components/AccountBar';

export default function AssetsPage() {
  const [assets, setAssets] = useState([]);
  const [source, setSource] = useState('this device');

  async function load() {
    const session = readSession();
    if (session?.email && session?.token) {
      try {
        const res = await fetch('/api/account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'load', email: session.email, token: session.token }),
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.clips) && data.clips.length) {
          setAssets(data.clips);
          setSource('your account');
          return;
        }
      } catch {}
    }
    try {
      const raw = JSON.parse(localStorage.getItem('viral_clipper_history') || '[]');
      const flat = raw.flatMap(h => (h.clips || []).map(c => ({ ...c, sourceUrl: h.url, createdAt: h.id })));
      setAssets(flat);
      setSource('this device');
    } catch {
      setAssets([]);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="min-h-screen bg-ink text-fg">
      <header className="sticky top-0 z-20 border-b border-line/60 bg-ink/70 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5">
          <a href="/" className="flex items-center gap-2.5 text-fg no-underline">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-lime text-ink font-extrabold">V</span>
            <span className="font-display text-lg font-extrabold tracking-tight">Viral AI Clipper</span>
          </a>
          <nav className="flex items-center gap-3 text-sm md:gap-6 font-medium text-soft">
            <a href="/" className="hidden hover:text-fg md:inline">Home</a>
            <a href="/connectors" className="hidden hover:text-fg md:inline">Connectors</a>
            <a href="/tools" className="hidden hover:text-fg md:inline">AI Tools</a>
            <a href="/assets" className="hidden text-lime sm:inline">My Assets</a>
            <AccountBar onChange={load} />
          </nav>
        </div>
      </header>

      <section className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Library</span>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-white md:text-[44px]">My Assets</h1>
          <p className="text-sm text-soft">{assets.length} clip{assets.length === 1 ? '' : 's'} from {source}.</p>
        </div>

        {assets.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
            <h2 className="font-display text-xl font-extrabold text-white">No assets yet</h2>
            <p className="text-sm text-soft">Generate clips and they will show up here. Create an account to keep them on every device.</p>
            <a href="/" className="btn-lime h-10 px-5 text-sm">Generate clips</a>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {assets.map((c, i) => (
              <ClipPlayer key={`asset-${c.id || i}-${c.createdAt || i}`} clip={c} index={i} compact />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
