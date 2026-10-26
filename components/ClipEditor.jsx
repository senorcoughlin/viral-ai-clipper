'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const uploadLogo = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setMsg('Logo must be under 5 MB.'); return; }
    setBusy('logo'); setMsg('Uploading your logo…');
    try {
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      const { upload } = await import('@vercel/blob/client');
      const ext = (file.name.match(/\.(png|jpe?g|webp)$/i) || ['.png'])[0].toLowerCase();
      const blob = await upload(`logos/logo${ext}`, file, { access: 'private', handleUploadUrl: '/api/upload' });
      setLogoPreview(dataUrl);
      try { localStorage.setItem('viral_logo_preview', dataUrl.length < 1500000 ? dataUrl : ''); } catch {}
      setBrand(b => ({ ...b, logoUrl: blob.url, customLogo: true, logo: { ...(b.logo || {}), on: true } }));
      setMsg('Logo ready. Save as brand kit to reuse it.');
    } catch (e) { setMsg(e.message || 'Logo upload failed'); } finally { setBusy(''); }
  };
  const words = Array.isArray(clip.words) ? clip.words : [];
  const [text, setText] = useState(words.map(w => w.w).join(' '));
  const [brand, setBrand] = useState({ color: 'white', size: 'm', position: 'bottom', upper: true, logo: { on: false, pos: 'tl', size: 'm', opacity: 90 }, wm: { on: true, pos: 'br', size: 's', opacity: 60 } });
  const [logoPreview, setLogoPreview] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const local = loadBrand();
    if (local) setBrand(b => ({ ...b, ...local }));
    try { const lp = localStorage.getItem('viral_logo_preview'); if (lp) setLogoPreview(lp); } catch {}
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
    <button type="button" onClick={onClick} style={style} aria-pressed={!!on} className={`min-h-[44px] rounded-full border px-4 py-2 text-[15px] capitalize ${on ? 'border-lime bg-lime/10 text-lime' : 'border-line2 text-fg'}`}>{children}</button>
  );
  const Heading = ({ children }) => <h4 className="text-[15px] font-bold text-white">{children}</h4>;
  const field = 'w-full rounded-input border border-line2 bg-ink px-3 py-3 text-base text-fg outline-none focus:border-lime';
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const onKey = e => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  if (!mounted) return null;
  const previewSize = { s: 14, m: 18, l: 24 }[brand.size] || 18;
  const previewPos = { top: 'top-3', middle: 'top-1/2 -translate-y-1/2', bottom: 'bottom-3' }[brand.position] || 'bottom-3';
  const previewText = (text.split(/\s+/).filter(Boolean).slice(0, 6).join(' ') || 'Your caption here');

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="clip-editor-title" data-testid="clip-editor" className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/80 md:items-center md:p-4" onClick={onClose}>
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#0b0b0b] md:card md:h-auto md:max-h-[90vh] md:max-w-lg md:rounded-2xl md:border md:border-line2" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line2 bg-[#0b0b0b] px-4 py-3">
          <h3 id="clip-editor-title" className="font-display text-xl font-extrabold text-white">Edit clip</h3>
          <button type="button" onClick={onClose} aria-label="Close editor" className="grid h-11 w-11 place-items-center rounded-full border border-line2 text-lg text-fg">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <div className="flex flex-col gap-6 text-[15px] leading-relaxed text-soft">
            <div className="relative mx-auto aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-xl bg-black" aria-label="Live preview">
              {videoUrl && <video src={videoUrl} muted playsInline loop autoPlay className="h-full w-full object-cover" />}
              {hook && <div className="absolute inset-x-2 top-2 rounded bg-black/70 px-2 py-1 text-center text-sm font-bold text-white">{hook}</div>}
              {(() => {
                const cls = p => `absolute ${p[0] === 't' ? 'top-2' : 'bottom-4'} ${p[1] === 'l' ? 'left-2' : 'right-2'}`;
                const lg = brand.logo?.on ? brand.logo : null; const wm = brand.wm?.on ? brand.wm : null;
                const lh = lg ? { s: 9, m: 13, l: 18 }[lg.size] : 0;
                return <>
                  {lg && <img data-testid="preview-logo" alt="Logo" src={brand.customLogo && logoPreview ? logoPreview : '/brand/logo.png'} className={cls(lg.pos)} style={{ height: lh, opacity: lg.opacity / 100 }} />}
                  {wm && <span data-testid="preview-wm" className={cls(wm.pos)} style={{ fontSize: { s: 7, m: 9, l: 12 }[wm.size], opacity: wm.opacity / 100, color: '#fff', textShadow: '0 1px 2px #000', marginTop: lg && lg.pos === wm.pos && wm.pos[0] === 't' ? lh + 3 : 0, marginBottom: lg && lg.pos === wm.pos && wm.pos[0] === 'b' ? lh + 3 : 0 }}>viralaiclipper.com</span>}
                </>;
              })()}
              <div className={`absolute inset-x-2 ${previewPos} text-center font-extrabold leading-tight`} style={{ color: BRAND_COLORS[brand.color] || '#fff', fontSize: previewSize, textShadow: '0 2px 4px #000, 0 0 2px #000', textTransform: brand.upper ? 'uppercase' : 'none' }}>{previewText}</div>
            </div>
            <label className="flex flex-col gap-2">
              <Heading>Captions</Heading>
              <span className="text-sm text-muted">{words.length ? 'Add, remove or fix words freely. Timing re-spreads across the clip automatically.' : 'Caption text'}</span>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={5} className={`${field} min-h-[120px]`} />
            </label>
            <section className="flex flex-col gap-3">
              <Heading>Caption color</Heading>
              <div className="flex flex-wrap gap-2">{Object.entries(BRAND_COLORS).map(([k, hex]) => <Chip key={k} on={brand.color === k} onClick={() => setBrand({ ...brand, color: k })}><span className="mr-2 inline-block h-4 w-4 rounded-full border border-white/40 align-[-2px]" style={{ background: hex }} />{k}</Chip>)}</div>
              <Heading>Size</Heading>
              <div className="flex flex-wrap gap-2">{['s', 'm', 'l'].map(k => <Chip key={k} on={brand.size === k} onClick={() => setBrand({ ...brand, size: k })}>{{ s: 'Small', m: 'Medium', l: 'Large' }[k]}</Chip>)}</div>
              <Heading>Position</Heading>
              <div className="flex flex-wrap gap-2">{['top', 'middle', 'bottom'].map(k => <Chip key={k} on={brand.position === k} onClick={() => setBrand({ ...brand, position: k })}>{k}</Chip>)}
                <Chip on={brand.upper} onClick={() => setBrand({ ...brand, upper: !brand.upper })}>All caps</Chip></div>
              <button type="button" onClick={saveBrand} className="btn-ghost min-h-[44px] self-start px-4 text-[15px]">Save as my brand kit</button>
            </section>
            <section className="flex flex-col gap-3" aria-label="Branding">
              <Heading>Branding</Heading>
              {[['logo', 'Viral AI Clipper logo'], ['wm', 'viralaiclipper.com watermark']].map(([k, label]) => {
                const m = brand[k] || {}; const set = patch => setBrand(b => ({ ...b, [k]: { ...(b[k] || {}), ...patch } }));
                return (
                  <div key={k} className="flex flex-col gap-2 rounded-xl border border-line2 p-3">
                    <label className="flex min-h-[44px] items-center justify-between gap-3 text-[15px] font-semibold text-fg">
                      {k === 'logo' && brand.customLogo ? 'My logo' : label}
                      <input type="checkbox" role="switch" aria-label={label} className="h-6 w-6 accent-[#C6FF3D]" checked={!!m.on} onChange={e => set({ on: e.target.checked })} />
                    </label>
                    {m.on && <>
                      <div className="flex flex-wrap gap-2">{[['tl', 'Top left'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['br', 'Bottom right']].map(([p, l]) => <Chip key={p} on={m.pos === p} onClick={() => set({ pos: p })}>{l}</Chip>)}</div>
                      <div className="flex flex-wrap gap-2">{['s', 'm', 'l'].map(z => <Chip key={z} on={m.size === z} onClick={() => set({ size: z })}>{{ s: 'S', m: 'M', l: 'L' }[z]}</Chip>)}</div>
                      <label className="flex items-center gap-3 text-[15px]">Opacity <input type="range" min={40} max={100} step={5} value={m.opacity || 85} onChange={e => set({ opacity: Number(e.target.value) })} className="h-8 flex-1 accent-[#C6FF3D]" /><span className="w-12 text-right text-fg">{m.opacity || 85}%</span></label>
                    </>}
                    {k === 'logo' && <div className="flex flex-wrap gap-2">
                      <label className="btn-ghost min-h-[44px] cursor-pointer px-4 text-[15px] leading-[44px]">{busy === 'logo' ? 'Uploading…' : 'Use my own logo'}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => uploadLogo(e.target.files?.[0])} /></label>
                      {brand.customLogo && <button type="button" onClick={() => setBrand(b => ({ ...b, customLogo: false }))} className="btn-ghost min-h-[44px] px-4 text-[15px]">Use Viral AI Clipper logo</button>}
                    </div>}
                  </div>
                );
              })}
              <button type="button" onClick={saveBrand} className="btn-ghost min-h-[44px] self-start px-4 text-[15px]">Save branding to my brand kit</button>
            </section>
            <section className="flex flex-col gap-3">
              <Heading>Make it your own</Heading>
              <span className="text-sm text-muted">Helps with YouTube&apos;s reused content rules.</span>
              <input value={hook} maxLength={60} onChange={e => setHook(e.target.value)} placeholder="Hook text pinned at the top (optional)" className={field} />
              <input value={overlayUrl} onChange={e => setOverlayUrl(e.target.value)} placeholder="Facecam / reaction video link (optional)" className={field} />
              <label className="btn-ghost min-h-[44px] cursor-pointer self-start px-4 text-[15px] leading-[44px]">{busy === 'cam' ? 'Uploading…' : 'Upload facecam'}<input type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={e => uploadCam(e.target.files?.[0])} /></label>
              <button type="button" disabled={!!busy} onClick={writeCommentary} className="btn-ghost min-h-[44px] self-start px-4 text-[15px]">{busy === 'script' ? 'Writing…' : 'Write a commentary script with AI'}</button>
              {script && <textarea value={script} onChange={e => setScript(e.target.value)} rows={5} className={field} />}
              {script && <p className="text-sm text-muted">Record this in your own voice (or rewrite it) and add it as a voiceover in your editor before posting.</p>}
              <label className="flex min-h-[44px] items-center gap-3 text-[15px] text-fg"><input type="checkbox" className="h-5 w-5" checked={commentary} onChange={e => { setCommentary(e.target.checked); setT({ commentary: e.target.checked }); }} /> I added my own commentary to this clip</label>
            </section>
            {msg && <p role="status" className="text-[15px] text-soft">{msg}</p>}
            {warn && <PreUploadWarning risks={warn} onCancel={() => setWarn(null)} onProceed={() => schedule(true)} />}
          </div>
        </div>
        <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-line2 bg-[#0b0b0b] px-4 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <button type="button" disabled={!!busy} onClick={rerender} className="btn-lime h-12 flex-1 whitespace-nowrap text-base">{busy === 'render' ? 'Rendering…' : 'Save & render'}</button>
          {clip.bestTime && <button type="button" disabled={!!busy} onClick={() => schedule()} className="btn-ghost h-12 flex-1 text-base">{busy === 'schedule' ? 'Scheduling…' : `Post at ${clip.bestTime}`}</button>}
          <button type="button" onClick={onClose} className="btn-ghost h-12 px-5 text-base">Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
