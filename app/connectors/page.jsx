'use client';

import { useEffect, useState } from 'react';

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/connectors').then(r => r.json()).then(d => setConnectors(d.connectors || [])).catch(() => {});
  }, []);

  async function connect(id) {
    setMessage('');
    const res = await fetch('/api/connectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'connect' }),
    });
    const data = await res.json();
    setMessage(data.message || (data.success ? `${id} is already connected.` : 'Could not connect'));
  }

  const groups = connectors.reduce((acc, c) => {
    acc[c.category] = acc[c.category] || [];
    acc[c.category].push(c);
    return acc;
  }, {});

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
            <a href="/connectors" className="text-lime">Connectors</a>
            <a href="/assets" className="hover:text-fg">My Assets</a>
          </nav>
        </div>
      </header>
      <section className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-10">
        <span className="eyebrow">Connectors</span>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-white md:text-[44px]">Plug in more tools</h1>
        <p className="text-sm text-soft">Ready connectors are live. Coming soon ones need an API key in Vercel to turn on. The registry is one file, so adding a new service is a single entry.</p>
        {message && <p className="text-sm text-lime">{message}</p>}
        {Object.entries(groups).map(([category, items]) => (
          <div key={category} className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[.1em] text-muted">{category}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map(c => (
                <div key={c.id} className="card flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{c.name}</span>
                    <span className={`text-[11px] font-bold uppercase ${c.status === 'ready' ? 'text-lime' : 'text-muted'}`}>{c.status}</span>
                  </div>
                  <p className="text-sm text-soft">{c.description}</p>
                  <button type="button" onClick={() => connect(c.id)} className="btn-ghost mt-1 h-9 self-start px-3 text-xs">
                    {c.status === 'ready' ? 'Connected' : 'Add key to activate'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
