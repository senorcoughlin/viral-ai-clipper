'use client';

import { useState } from 'react';

const TOOLS = [
  { id: 'hooks', label: 'Hooks', hint: '8 short openers that stop the scroll' },
  { id: 'captions', label: 'Captions', hint: 'Post text, hashtags, and a CTA' },
  { id: 'script', label: 'Script', hint: '30-second spoken script with beats' },
  { id: 'ideas', label: 'Ideas', hint: '10 content ideas with a reason' },
  { id: 'titles', label: 'Titles', hint: 'Punchy titles under 60 characters' },
  { id: 'rewrite', label: 'Rewrite', hint: 'Make any line sharper' },
  { id: 'cta', label: 'CTAs', hint: 'End-screen calls to action' },
  { id: 'thumbnails', label: 'Thumbnails', hint: 'Image prompts for high-click thumbs' },
];

export default function ToolsPage() {
  const [tool, setTool] = useState('hooks');
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  async function run(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, input }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message || 'Failed'); return; }
      setResult(data.result);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  function copy(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 1200);
  }

  const current = TOOLS.find(t => t.id === tool);

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
            <a href="/connectors" className="hover:text-fg">Connectors</a>
            <a href="/tools" className="text-lime">AI Tools</a>
            <a href="/assets" className="hover:text-fg">My Assets</a>
            <a href="/channel" className="hover:text-fg">Channel</a>
          </nav>
        </div>
      </header>
      <section className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-10">
        <span className="eyebrow">AI Tools</span>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-white md:text-[44px]">More AI, in one place</h1>
        <p className="text-sm text-soft">Hooks, captions, scripts, ideas, titles, rewrites, CTAs, and thumbnail prompts. Powered by Gemini.</p>
        <div className="flex flex-wrap gap-2">
          {TOOLS.map(t => (
            <button key={t.id} type="button" onClick={() => { setTool(t.id); setResult(null); }} className={tool === t.id ? 'chip chip-on' : 'chip'}>{t.label}</button>
          ))}
        </div>
        <form onSubmit={run} className="card flex flex-col gap-3 p-4">
          <label className="text-xs font-semibold uppercase tracking-[.08em] text-muted">{current?.hint}</label>
          <textarea value={input} onChange={e => setInput(e.target.value)} rows={4} required placeholder="Paste a topic, niche, or line of text…" className="w-full rounded-input border border-line2 bg-ink px-3 py-3 text-sm outline-none focus:border-lime" />
          <button type="submit" disabled={busy} className="btn-lime h-11 self-start px-5 text-sm">{busy ? 'Working…' : 'Generate'}</button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
        {result && (
          <div className="card flex flex-col gap-3 p-4">
            {Array.isArray(result) && result.map((line, i) => (
              <div key={i} className="flex items-start justify-between gap-3 border-b border-line/50 pb-2 last:border-0">
                <p className="text-sm text-soft">{String(line)}</p>
                <button type="button" onClick={() => copy(String(line), i)} className="text-xs text-lime">{copied === i ? 'Copied' : 'Copy'}</button>
              </div>
            ))}
            {result.captions && result.captions.map((c, i) => (
              <div key={i} className="rounded-input border border-line2 p-3 text-sm">
                <p className="text-white">{c.text}</p>
                <p className="mt-1 text-lime">{c.hashtags}</p>
                <p className="mt-1 text-muted">{c.cta}</p>
                <button type="button" onClick={() => copy(`${c.text}\n${c.hashtags}\n${c.cta}`, i)} className="mt-2 text-xs text-lime">{copied === i ? 'Copied' : 'Copy'}</button>
              </div>
            ))}
            {result.ideas && result.ideas.map((idea, i) => (
              <div key={i} className="border-b border-line/50 pb-2 last:border-0">
                <p className="font-semibold text-white">{idea.title}</p>
                <p className="text-sm text-soft">{idea.hook}</p>
                <p className="text-xs text-muted">{idea.why}</p>
              </div>
            ))}
            {result.script && (
              <div>
                <p className="whitespace-pre-wrap text-sm text-soft">{result.script}</p>
                {result.beats && <ul className="mt-2 text-xs text-muted">{result.beats.map((b, i) => <li key={i}>{b}</li>)}</ul>}
                <button type="button" onClick={() => copy(result.script, 'script')} className="mt-2 text-xs text-lime">{copied === 'script' ? 'Copied' : 'Copy'}</button>
              </div>
            )}
            {result.versions && result.versions.map((v, i) => (
              <div key={i} className="flex items-start justify-between gap-3 border-b border-line/50 pb-2 last:border-0">
                <p className="text-sm text-soft">{v}</p>
                <button type="button" onClick={() => copy(v, i)} className="text-xs text-lime">{copied === i ? 'Copied' : 'Copy'}</button>
              </div>
            ))}
            {result.prompts && result.prompts.map((p, i) => (
              <div key={i} className="flex items-start justify-between gap-3 border-b border-line/50 pb-2 last:border-0">
                <p className="text-sm text-soft">{p}</p>
                <button type="button" onClick={() => copy(p, i)} className="text-xs text-lime">{copied === i ? 'Copied' : 'Copy'}</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
