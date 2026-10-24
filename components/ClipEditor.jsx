'use client';

import { useEffect, useState } from 'react';
import { withCredit, reuseRisks, PreUploadWarning } from './PostCheck';

export const BRAND_COLORS = { white: '#FFFFFF', yellow: '#FFE600', lime: '#C6FF3D', cyan: '#3DE0FF', pink: '#FF4D9A', orange: '#FFB64D' };

export function loadBrand() {
  try { return JSON.parse(localStorage.getItem('viral_brand') || 'null'); } catch { return null; }
}

// Re-time edited words: same word count keeps the original timings; otherwise the
// new words are spread evenly over the original spoken span.
function retime(original, text) {
  const next = text.split(/\s+/).filter(Boolean).slice(0, 300);
  if (!original.length) return [];
  if (next.length === original.length) return original.map((o, i) => ({ ...o, w: next[i] }));
  const a0 = original[0].a;
  const b1 = original[original.length - 1].b;
  const step = Math.max(0.12, (b1 - a0) / Math.max(1, next.length));
  return next.map((w, i) => ({ w, a: +(a0 + i * step).toFixed(2), b: +(a0 + (i + 1) * step).toFixed(2) }));
}

export default function ClipEditor({ clip, videoUrl, credit, transform = {}, onTransform, onRendered, onClose }) {
  const [hook, setHook] = useState(transform.hook || '');
  const [overlayUrl, setOverlayUrl] = useState('');
  const [script, setScript] = useState('');
  const [commentary, setCommentary] = useState(!!transform.commentary);
  const [warn, setWarn] = useState(null);
  const setT = patch => onTransform?.({ ...transform, ...patch });
  const writeCommentary = async () => {
    setBusy('script'); setMsg('');
    try {
      const input = [clip.title, clip.hook, (Array.isArray(clip.words) ? clip.words.map(w => w.w).join(' ') : clip.caption)].filter(Boolean).join('\n').slice(0, 3500);
      const d = await (await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: 'commentary', input: input || 'a short stream clip' }) })).json();
      if (!d.success) throw new Error(d.message || 'Could not write a script');
      setScript(d.result?.script || d.result?.text || '');
      if (!hook && d.result?.hook) setHook(String(d.result.hook).slice(0, 60));
    } catch (e) { setMsg(e.message); } finally { setBusy(''); }
  };
  const uploadCam = async (file) => {
    if (!file) return;
    setBusy('cam'); setMsg('Uploading facecam…');
    try {
      const { upload } = await import('@vercel/blob/client');
      const blob = await upload(`uploads/cam_${file.name.replace(/[^\w.-]+/g, '_')}`, file, { access: 'private', handleUploadUrl: '/api/upload' });
      setOverlayUrl(blob.url); setMsg('Facecam ready. Re-render to add it.');
    } catch (e) { setMsg(e.message || 'Upload failed'); } finally { setBusy(''); }
  };
  const words = Array.isArray(clip.words) ? clip.words : [];
  const [text, setText] = useState(words.map(w => w.w).join(' '));
  const [brand, setBrand] = useState({ color: 'white', size: 'm', position: 'bottom', upper: true });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const local = loadBrand();
    if (local) setBrand(b => ({ ...b, ...local }));
    fetch('/api/brand').then(r => r.json()).then(d => { if (d?.brand && Object.keys(d.brand).length) setBrand(b => ({ ...b, ...d.brand })); }).catch(() => {});
  }, []);

  const saveBrand = async () => {
    localStorage.setItem('viral_brand', JSON.stringify(brand));
    const r = await fetch('/api/brand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brand }) }).catch(() => null);
    setMsg(r?.ok ? 'Brand kit saved to your account.' : 'Brand kit saved on this device.');
  };

  const rerender = async () => {
    setBusy('render'); setMsg('Re-rendering… this takes about a minute.');
    try {
      const res = await fetch('/api/rerender', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: clip.source, startSec: clip.startSec, endSec: clip.endSec, format: clip.format, style: clip.style, crop: clip.crop, caption: words.length ? '' : text, words: retime(words, text), brand, hook: hook.trim(), overlayUrl: overlayUrl.trim() || undefined }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || 'Re-render failed');
      onRendered?.(d.videoUrl);
      setT({ hook: hook.trim(), overlay: !!overlayUrl.trim() || transform.overlay });
      setMsg('Done — the clip now uses your edited captions.');
    } catch (e) { setMsg(e.message); } finally { setBusy(''); }
  };

  const schedule = async (checked = false) => {
    const risks = reuseRisks(clip, { ...transform, commentary });
    if (!checked && risks.length) { setWarn(risks); return; }
    setWarn(null);
    setBusy('schedule'); setMsg('Scheduling on YouTube…');
    try {
      const res = await fetch('/api/post', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'youtube', schedule: true, bestTime: clip.bestTime, caption: withCredit([clip.socialCaption || clip.caption, clip.hashtags].filter(Boolean).join('\n\n'), credit, !!credit), videoUrl, title: clip.title, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const d = await res.json();
      if (d?.data?.mode === 'youtube-scheduled') {
        setMsg(`Scheduled for ${new Date(d.data.publishAt).toLocaleString()}.`);
        window.open(d.data.url, '_blank');
      } else if (d?.data?.mode === 'open') {
        setMsg('Connect YouTube first (top menu → Connect YouTube), then try again.');
      } else throw new Error(d?.message || 'Scheduling failed');
    } catch (e) { setMsg(e.message); } finally { setBusy(''); }
  };

  const Chip = ({ on, onClick, children, style }) => (
    <button type="button" onClick={onClick} style={style} className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-lime text-lime' : 'border-line2 text-soft'}`}>{children}</button>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Edit clip" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="card flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold text-white">Edit captions</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-fg">✕</button>
        </div>
        <label className="flex flex-col gap-1.5 text-xs text-muted">
          {words.length ? 'Caption words (keep the same number of words to keep exact timing)' : 'Caption text'}
          <textarea value={text} onChange={e => setText(e.target.value)} rows={5} className="rounded-input border border-line2 bg-ink px-3 py-2 text-sm text-fg outline-none focus:border-lime" />
        </label>
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">Brand kit</span>
          <div className="flex flex-wrap gap-1.5">{Object.entries(BRAND_COLORS).map(([k, hex]) => <Chip key={k} on={brand.color === k} onClick={() => setBrand({ ...brand, color: k })}><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: hex }} />{k}</Chip>)}</div>
          <div className="flex flex-wrap gap-1.5">{['s', 'm', 'l'].map(k => <Chip key={k} on={brand.size === k} onClick={() => setBrand({ ...brand, size: k })}>{{ s: 'Small', m: 'Medium', l: 'Large' }[k]}</Chip>)}</div>
          <div className="flex flex-wrap gap-1.5">{['top', 'middle', 'bottom'].map(k => <Chip key={k} on={brand.position === k} onClick={() => setBrand({ ...brand, position: k })}>{k}</Chip>)}
            <Chip on={brand.upper} onClick={() => setBrand({ ...brand, upper: !brand.upper })}>UPPERCASE</Chip></div>
          <button type="button" onClick={saveBrand} className="btn-ghost h-9 self-start px-3 text-xs">Save as my brand kit</button>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">Transform (helps with YouTube&apos;s reused content rules)</span>
          <input value={hook} maxLength={60} onChange={e => setHook(e.target.value)} placeholder="Hook text pinned at the top (optional)" className="rounded-input border border-line2 bg-ink px-3 py-2 text-sm text-fg outline-none focus:border-lime" />
          <div className="flex flex-wrap items-center gap-2">
            <input value={overlayUrl} onChange={e => setOverlayUrl(e.target.value)} placeholder="Facecam / reaction video link (optional)" className="min-w-0 flex-1 rounded-input border border-line2 bg-ink px-3 py-2 text-xs text-fg outline-none focus:border-lime" />
            <label className="btn-ghost h-9 cursor-pointer px-3 text-xs leading-9">{busy === 'cam' ? 'Uploading…' : 'Upload facecam'}<input type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={e => uploadCam(e.target.files?.[0])} /></label>
          </div>
          <button type="button" disabled={!!busy} onClick={writeCommentary} className="btn-ghost h-9 self-start px-3 text-xs">{busy === 'script' ? 'Writing…' : 'Write a commentary script with AI'}</button>
          {script && <textarea value={script} onChange={e => setScript(e.target.value)} rows={5} className="rounded-input border border-line2 bg-ink px-3 py-2 text-xs text-fg outline-none" />}
          {script && <p className="text-[11px] text-muted">Record this in your own voice (or rewrite it) and add it as a voiceover in your editor before posting.</p>}
          <label className="flex items-center gap-2 text-xs text-soft"><input type="checkbox" checked={commentary} onChange={e => { setCommentary(e.target.checked); setT({ commentary: e.target.checked }); }} /> I added my own commentary to this clip</label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={rerender} className="btn-lime h-10 flex-1 text-sm">{busy === 'render' ? 'Rendering…' : 'Re-render clip'}</button>
          {clip.bestTime && <button type="button" disabled={!!busy} onClick={() => schedule()} className="btn-ghost h-10 flex-1 text-sm">{busy === 'schedule' ? 'Scheduling…' : `Post at best time (${clip.bestTime})`}</button>}
        </div>
        {msg && <p role="status" className="text-xs text-soft">{msg}</p>}
        {warn && <PreUploadWarning risks={warn} onCancel={() => setWarn(null)} onProceed={() => schedule(true)} />}
      </div>
    </div>
  );
}
