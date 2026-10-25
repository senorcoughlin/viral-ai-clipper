'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ViralScoreMeter from './ViralScoreMeter';
import { clipFileName, downloadHref } from './ClipPlayer';
import { useCredit } from './PostCheck';
import { BRAND_COLORS, loadBrand } from './ClipEditor';

const fmt = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const handleOf = (src, author) => {
  const m = String(src || '').match(/twitch\.tv\/(?!videos\b)([A-Za-z0-9_]{3,25})/i) || String(src || '').match(/kick\.com\/([A-Za-z0-9_-]{3,25})/i);
  if (m) return '@' + m[1];
  return author ? '@' + String(author).replace(/\s+/g, '') : '';
};

// Monetization-readiness checks shown before publishing.
export function clipLength(ed, dur) {
  const trimmed = Math.max(0, (ed.end ?? 0) - (ed.start ?? 0));
  return ed.trimmed || !dur ? trimmed : dur;
}

export function monetizationChecks(clip, ed, dur) {
  const len = clipLength(ed, dur);
  const vertical = (clip.format || 'shorts_9_16') === 'shorts_9_16';
  return [
    { k: 'vertical', ok: vertical, label: 'Vertical 9:16', tip: 'Re-generate with the 9:16 format for Shorts, TikTok and Reels.' },
    { k: 'length', ok: len >= 15 && len <= 60, label: `Length 15–60s (now ${Math.round(len)}s)`, tip: 'Trim to 15–60 seconds for Shorts/TikTok.' },
    { k: 'captions', ok: !!ed.captions && (Array.isArray(clip.words) ? clip.words.length > 0 : !!clip.subtitlesEnabled), label: 'Captions burned in', tip: 'Turn captions on and re-render.' },
    { k: 'transform', ok: !!(ed.rendered && (ed.hook.trim() || ed.progress || ed.zoom || ed.bg || ed.cam)), label: 'Transformation added', tip: 'Add hook text, zoom, a background, a progress bar or a facecam, then re-render.' },
    { k: 'credit', ok: !!(ed.rendered && ed.creditOn && ed.credit.trim()), label: 'Source credit on the video', tip: 'Turn on "Clip from @streamer" and re-render.' },
    { k: 'short', ok: len <= 90, label: 'Not a long unedited reupload', tip: 'Keep clips short and edited.' },
  ];
}

export default function StudioClip({ clip, index, selected, onSelect }) {
  const credit = useCredit(clip.source);
  const s0 = Number(clip.startSec) || 0;
  const e0 = Number(clip.endSec) || s0 + (Number(clip.duration) || 30);
  const [videoUrl, setVideoUrl] = useState(clip.videoUrl || '');
  const [open, setOpen] = useState(''); // '' | 'edit' | 'publish'
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState('');
  const [ed, setEd] = useState(() => ({
    start: s0, end: e0, captions: true, color: 'white', size: 'm', position: 'bottom',
    hook: clip.hook || '', creditOn: true, credit: '', progress: false, rendered: false, zoom: '', bg: '', cam: '', trimmed: false,
    title: clip.title || '', description: clip.socialCaption || clip.caption || '', hashtags: clip.hashtags || '',
  }));
  const [ideas, setIdeas] = useState(null);
  const set = (p) => setEd(e => ({ ...e, ...p }));
  const [dur, setDur] = useState(0);
  useEffect(() => { const b = loadBrand(); if (b) set({ color: b.color || 'white', size: b.size || 'm', position: b.position || 'bottom' }); }, []);
  useEffect(() => { if (!ed.credit) { const h = handleOf(clip.source, credit?.author); if (h) set({ credit: `Clip from ${h}` }); } }, [credit, clip.source]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setVideoUrl(clip.videoUrl || ''); }, [clip.videoUrl]);

  const score = Number(clip.viralScore || clip.score) || 0;
  const checks = useMemo(() => monetizationChecks(clip, ed, dur), [clip, ed, dur]);
  const ready = checks.every(c => c.ok);
  const postText = [ed.description.trim(), ed.hashtags.trim(), ed.creditOn && ed.credit.trim() ? ed.credit.trim() : ''].filter(Boolean).join('\n\n');
  const fileName = () => clipFileName(ed.title || clip.title, (index ?? 0) + 1);

  const copy = async (text, key) => { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1600); } catch {} };
  const download = () => {
    const a = document.createElement('a'); const n = fileName();
    a.href = downloadHref(videoUrl, n); a.download = n; document.body.appendChild(a); a.click(); a.remove();
  };
  const share = async () => {
    setBusy('share'); setMsg(null);
    try {
      const n = fileName();
      const blob = await (await fetch(downloadHref(videoUrl, n))).blob();
      const file = new File([blob], n, { type: 'video/mp4' });
      copy(postText, 'share');
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: ed.title, text: postText });
      else { download(); setMsg({ ok: true, text: 'Saved the video. Caption copied — paste it in the app.' }); }
    } catch (e) { if (e?.name !== 'AbortError') setMsg({ ok: false, text: 'Sharing failed. Use Download instead.' }); } finally { setBusy(''); }
  };
  const forApp = (url, key) => { download(); copy(postText, key); setMsg({ ok: true, text: 'Video downloading, caption copied. Upload it in the app.' }); window.open(url, '_blank'); };
  const youtube = async () => {
    setBusy('yt'); setMsg(null); copy(postText, 'yt');
    try {
      const d = (await (await fetch('/api/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: 'youtube', caption: postText, videoUrl, title: (ed.title || clip.title || '').slice(0, 100) }) })).json())?.data || {};
      if (d.mode === 'youtube-uploaded' || d.mode === 'youtube-scheduled') setMsg({ ok: true, text: 'Uploaded to your YouTube as private. Review and publish it in YouTube Studio.', url: d.url });
      else if (d.why === 'not_connected' || d.why === 'not_authorized') setMsg({ ok: false, text: 'Connect your YouTube channel first (Google may show an "unverified app" screen while our review is pending — tap Advanced → continue). Caption copied.', connect: true });
      else setMsg({ ok: false, text: 'Auto-upload failed. Caption copied — upload it in YouTube Studio.', url: d.url || 'https://studio.youtube.com/' });
    } catch { setMsg({ ok: false, text: 'Could not reach the uploader. Caption copied.', url: 'https://studio.youtube.com/' }); } finally { setBusy(''); }
  };
  const rerender = async () => {
    setBusy('render'); setMsg({ ok: true, text: 'Re-rendering… about a minute.' });
    try {
      const start = Math.max(0, ed.start), end = Math.max(start + 3, ed.trimmed ? ed.end : (dur ? s0 + dur : ed.end));
      const words = ed.captions && Array.isArray(clip.words) ? clip.words.map(w => ({ w: w.w, a: +(w.a + s0 - start).toFixed(2), b: +(w.b + s0 - start).toFixed(2) })).filter(w => w.a >= 0 && w.b <= end - start + 0.5) : [];
      const res = await fetch('/api/rerender', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        source: clip.source, startSec: start, endSec: end, format: clip.format, style: clip.style, crop: clip.crop,
        caption: '', words, brand: { color: ed.color, size: ed.size, position: ed.position, upper: true },
        hook: ed.hook.trim(), credit: ed.creditOn ? ed.credit.trim() : '', progress: ed.progress, zoom: ed.zoom, bg: ed.bg, overlayUrl: ed.cam || undefined,
      }) });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || 'Re-render failed');
      setVideoUrl(d.videoUrl); set({ rendered: true });
      setMsg({ ok: true, text: 'Done — the preview now shows your edits.' });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };
  const uploadCam = async (file) => {
    if (!file) return;
    setBusy('cam'); setMsg({ ok: true, text: 'Uploading facecam…' });
    try {
      const { upload } = await import('@vercel/blob/client');
      const blob = await upload(`uploads/cam_${file.name.replace(/[^\w.-]+/g, '_')}`, file, { access: 'private', handleUploadUrl: '/api/upload' });
      set({ cam: blob.url }); setMsg({ ok: true, text: 'Facecam ready. Tap Apply edits to add it.' });
    } catch (e) { setMsg({ ok: false, text: e.message || 'Upload failed' }); } finally { setBusy(''); }
  };
  const ytRef = useRef(null);
  ytRef.current = youtube;
  useEffect(() => {
    const h = (e) => { if (selected && e.detail?.platform === 'youtube') ytRef.current?.(); };
    window.addEventListener('studio-publish', h);
    return () => window.removeEventListener('studio-publish', h);
  }, [selected]);
  const suggest = async () => {
    setBusy('ai');
    try {
      const input = [clip.title, clip.hook, Array.isArray(clip.words) ? clip.words.map(w => w.w).join(' ') : clip.caption].filter(Boolean).join('\n').slice(0, 3000) || 'a short stream clip';
      const [t, c] = await Promise.all(['titles', 'captions'].map(tool => fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool, input }) }).then(r => r.json()).catch(() => ({}))));
      const titles = Array.isArray(t?.result) ? t.result.slice(0, 4) : [];
      const caps = Array.isArray(c?.result?.captions) ? c.result.captions.slice(0, 3) : [];
      if (!titles.length && !caps.length) throw new Error('No suggestions right now. Try again in a minute.');
      setIdeas({ titles, caps });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };

  const Toggle = ({ on, onClick, children }) => <button type="button" aria-pressed={on} onClick={onClick} className={`chip shrink-0 ${on ? 'chip-on' : ''}`}>{children}</button>;
  const field = 'w-full rounded-input border border-line2 bg-ink px-3 py-2.5 text-[15px] text-fg outline-none focus:border-lime';

  return (
    <article className="card flex min-w-0 flex-col overflow-hidden animate-fadeup" data-studio-clip>
      <div className="relative aspect-[9/16] max-h-[78vh] w-full bg-black">
        <video src={videoUrl ? `${videoUrl.split('#')[0]}#t=0.1` : undefined} className="absolute inset-0 h-full w-full object-contain" controls playsInline preload="metadata" onLoadedMetadata={e => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0 && !dur) { setDur(d); setEd(x => x.trimmed ? x : { ...x, end: x.start + d }); } }} />
        <label className="absolute left-3 top-3 z-10 flex h-9 items-center gap-2 rounded-full border border-line2 bg-ink/85 px-3 text-xs font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-lime" checked={!!selected} onChange={e => onSelect?.(e.target.checked)} /> Select
        </label>
        {score > 0 && <div className="pointer-events-none absolute right-3 top-3"><ViralScoreMeter score={score} size={56} /></div>}
      </div>
      <div className="flex flex-col gap-3 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 font-display text-base font-extrabold leading-snug text-white">{ed.title || `Clip ${(index ?? 0) + 1}`}</p>
          <span className="shrink-0 font-mono text-xs text-muted">{fmt(clipLength(ed, dur))}</span>
        </div>
        <button type="button" onClick={() => setOpen(open === 'publish' ? '' : 'publish')} className="btn-lime h-12 w-full text-[15px] font-extrabold">🚀 Publish</button>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={download} className="btn-ghost h-11 text-sm">Download</button>
          <button type="button" onClick={() => setOpen(open === 'edit' ? '' : 'edit')} aria-expanded={open === 'edit'} className="btn-ghost h-11 text-sm">{open === 'edit' ? 'Close edit' : 'Edit'}</button>
          <button type="button" onClick={() => copy(postText || ed.title, 'cap')} className="btn-ghost h-11 text-sm">{copied === 'cap' ? 'Copied ✓' : 'Copy caption'}</button>
        </div>
        <ul className="flex flex-col gap-1 rounded-input border border-line bg-ink/60 p-2.5 text-xs" aria-label="Monetization check">
          <li className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">Monetization check {ready ? '· ready ✓' : `· ${checks.filter(c => c.ok).length}/${checks.length}`}</li>
          {checks.map(c => <li key={c.k} className={c.ok ? 'text-lime' : 'text-soft'} title={c.ok ? '' : c.tip}>{c.ok ? '✓' : '○'} {c.label}{!c.ok && <span className="text-muted"> — {c.tip}</span>}</li>)}
        </ul>
        {msg && (
          <p role="status" className={`rounded-input border p-2.5 text-xs ${msg.ok ? 'border-lime/50 text-soft' : 'border-[#FF4D6D]/60 text-fg'}`}>
            {msg.text}{msg.url && <> <a href={msg.url} target="_blank" rel="noreferrer" className="font-semibold text-lime">Open →</a></>}{msg.connect && <> <a href="/api/youtube/start" className="font-semibold text-lime">Connect YouTube →</a></>}
          </p>
        )}

        {open === 'publish' && (
          <div className="flex flex-col gap-2 rounded-input border border-line2 p-3" data-publish>
            {!ready && <p className="text-xs text-[#FFB64D]">Not every monetization check is green yet. You can still publish, but YouTube and TikTok may limit reach or monetization on reused clips.</p>}
            <button type="button" onClick={youtube} disabled={!!busy} className="btn-lime h-11 w-full text-sm">{busy === 'yt' ? 'Uploading…' : 'YouTube Shorts (uploads as private)'}</button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => forApp('https://www.tiktok.com/upload', 'tt')} className="btn-ghost h-11 text-sm">TikTok</button>
              <button type="button" onClick={() => forApp('https://www.instagram.com/', 'ig')} className="btn-ghost h-11 text-sm">Instagram Reels</button>
            </div>
            <button type="button" onClick={share} disabled={!!busy} className="btn-ghost h-11 w-full text-sm">{busy === 'share' ? 'Preparing…' : 'Share… (save to phone / send to any app)'}</button>
          </div>
        )}

        {open === 'edit' && (
          <div className="flex flex-col gap-3 rounded-input border border-line2 p-3" data-editor>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted">Trim</span>
              {[['Start', 'start'], ['End', 'end']].map(([l, k]) => (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <span className="w-10 text-xs text-soft">{l}</span>
                  <button type="button" onClick={() => set({ [k]: Math.max(0, ed[k] - 1), trimmed: true })} className="btn-ghost h-9 w-11 p-0" aria-label={`${l} earlier`}>−1s</button>
                  <span className="w-14 text-center font-mono text-sm">{fmt(ed[k])}</span>
                  <button type="button" onClick={() => set({ [k]: ed[k] + 1, trimmed: true })} className="btn-ghost h-9 w-11 p-0" aria-label={`${l} later`}>+1s</button>
                </div>
              ))}
              <span className="text-[11px] text-muted">Length {Math.round(clipLength(ed, dur))}s · aim for 15–60s</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted">Captions</span>
              <div className="flex flex-wrap gap-1.5">
                <Toggle on={ed.captions} onClick={() => set({ captions: !ed.captions })}>{ed.captions ? 'On' : 'Off'}</Toggle>
                {Object.keys(BRAND_COLORS).map(c => <button key={c} type="button" aria-label={`Caption color ${c}`} aria-pressed={ed.color === c} onClick={() => set({ color: c })} className={`h-8 w-8 rounded-full border-2 ${ed.color === c ? 'border-lime' : 'border-line2'}`} style={{ background: BRAND_COLORS[c] }} />)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['s', 'm', 'l'].map(z => <Toggle key={z} on={ed.size === z} onClick={() => set({ size: z })}>{z.toUpperCase()}</Toggle>)}
                {['top', 'middle', 'bottom'].map(p => <Toggle key={p} on={ed.position === p} onClick={() => set({ position: p })}>{p}</Toggle>)}
              </div>
            </div>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">Hook text (top of video)
              <input value={ed.hook} maxLength={60} onChange={e => set({ hook: e.target.value })} placeholder="Wait for it…" className={field} />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted">Transform</span>
              <div className="flex flex-wrap gap-1.5">
                <Toggle on={ed.progress} onClick={() => set({ progress: !ed.progress })}>Progress bar</Toggle>
                <Toggle on={ed.zoom === 'punch'} onClick={() => set({ zoom: ed.zoom === 'punch' ? '' : 'punch' })}>Zoom 15%</Toggle>
                <Toggle on={ed.zoom === 'tight'} onClick={() => set({ zoom: ed.zoom === 'tight' ? '' : 'tight' })}>Punch-in 30%</Toggle>
              </div>
              {(clip.format || 'shorts_9_16') === 'shorts_9_16' && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted">Background</span>
                  <Toggle on={!ed.bg} onClick={() => set({ bg: '' })}>Fill (crop)</Toggle>
                  <Toggle on={ed.bg === 'blur'} onClick={() => set({ bg: 'blur' })}>Blurred</Toggle>
                  <Toggle on={ed.bg === 'black'} onClick={() => set({ bg: 'black' })}>Black</Toggle>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="chip shrink-0 cursor-pointer">{busy === 'cam' ? 'Uploading…' : ed.cam ? 'Facecam ✓ (replace)' : '+ Reaction facecam'}<input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" className="hidden" disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; uploadCam(f); }} /></label>
                {ed.cam && <button type="button" onClick={() => set({ cam: '' })} className="chip shrink-0">Remove facecam</button>}
                <Toggle on={ed.creditOn} onClick={() => set({ creditOn: !ed.creditOn })}>Source credit</Toggle>
              </div>
              {ed.creditOn && <input value={ed.credit} maxLength={40} onChange={e => set({ credit: e.target.value })} placeholder="Clip from @streamer" className={field} aria-label="Credit text" />}
            </div>
            <button type="button" onClick={rerender} disabled={!!busy || !clip.source} className="btn-lime h-11 w-full text-sm">{busy === 'render' ? 'Re-rendering…' : 'Apply edits (re-render)'}</button>
            <div className="flex flex-col gap-1.5 border-t border-line pt-3">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted">Post details</span>
                <button type="button" onClick={suggest} disabled={!!busy} className="text-xs font-semibold text-lime">{busy === 'ai' ? 'Thinking…' : '✨ AI suggest'}</button></div>
              <input value={ed.title} maxLength={100} onChange={e => set({ title: e.target.value })} placeholder="Title" className={field} aria-label="Title" />
              {ideas?.titles?.length > 0 && <div className="flex flex-wrap gap-1.5">{ideas.titles.map(t => <button key={t} type="button" onClick={() => set({ title: String(t).slice(0, 100) })} className="chip text-left">{String(t)}</button>)}</div>}
              <textarea value={ed.description} rows={3} onChange={e => set({ description: e.target.value })} placeholder="Description" className={field} aria-label="Description" />
              {ideas?.caps?.length > 0 && <div className="flex flex-col gap-1.5">{ideas.caps.map((c, i) => <button key={i} type="button" onClick={() => set({ description: String(c.text || ''), hashtags: String(c.hashtags || ed.hashtags) })} className="rounded-input border border-line2 p-2 text-left text-xs text-soft hover:border-lime">{String(c.text || '')} <span className="text-lime">{String(c.hashtags || '')}</span></button>)}</div>}
              <input value={ed.hashtags} onChange={e => set({ hashtags: e.target.value })} placeholder="#shorts #twitch" className={field} aria-label="Hashtags" />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
