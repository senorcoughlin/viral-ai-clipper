'use client';

import { useEffect, useRef, useState } from 'react';

// ---------- shared helpers (pure, unit-tested) ----------
export const ASPECTS = [['9:16', 9 / 16], ['1:1', 1], ['16:9', 16 / 9], ['Free', 0]];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r4 = v => Math.round(v * 10000) / 10000;

// Largest centered box of pixel aspect `ratio` inside a frame of pixel aspect `frameAR`.
export function fitAspect(ratio, frameAR, around) {
  if (!ratio) return around || { x: 0, y: 0, w: 1, h: 1 };
  let w = 1, h = frameAR / ratio;
  if (h > 1) { h = 1; w = ratio / frameAR; }
  const cx = around ? around.x + around.w / 2 : 0.5, cy = around ? around.y + around.h / 2 : 0.5;
  return { x: r4(clamp(cx - w / 2, 0, 1 - w)), y: r4(clamp(cy - h / 2, 0, 1 - h)), w: r4(w), h: r4(h) };
}

// Words cut -> merged [a,b] time ranges (clip seconds). A run of cut words also removes
// the short gap up to the next kept word so speech doesn't leave a stutter.
export function cutRanges(words, cutSet) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    if (!cutSet.has(i)) continue;
    let j = i; while (j + 1 < words.length && cutSet.has(j + 1)) j++;
    const a = Number(words[i].a) || 0;
    const nx = words[j + 1];
    const end = nx && Number(nx.a) - Number(words[j].b) < 0.6 ? Number(nx.a) : Number(words[j].b) + 0.05;
    const prev = out[out.length - 1];
    if (prev && a <= prev[1] + 0.05) prev[1] = Math.max(prev[1], end); else out.push([r4(a), r4(end)]);
    i = j;
  }
  return out;
}

export const inRanges = (t, ranges) => ranges.some(([a, b]) => t >= a && t < b);

// Remove words inside cut ranges and shift the rest onto the shortened timeline.
export function applyCuts(words, ranges) {
  if (!ranges.length) return words;
  const shift = t => { let s = 0; for (const [a, b] of ranges) { if (b <= t) s += b - a; else if (a < t) s += t - a; } return t - s; };
  return words.filter(w => !inRanges((Number(w.a) + Number(w.b)) / 2, ranges))
    .map(w => ({ ...w, a: +shift(Number(w.a)).toFixed(2), b: +Math.max(shift(Number(w.a)) + 0.05, shift(Number(w.b))).toFixed(2) }));
}

// Group words into tappable lines: sentence ends, pauses, speaker changes, or ~10 words.
export function toLines(words) {
  const lines = []; let cur = null;
  words.forEach((w, i) => {
    const prev = words[i - 1];
    const brk = !cur || cur.idx.length >= 10 || (prev && (/[.!?]$/.test(prev.w) || Number(w.a) - Number(prev.b) > 0.8 || (w.spk != null && w.spk !== prev.spk)));
    if (brk) { cur = { idx: [], spk: w.spk ?? null }; lines.push(cur); }
    cur.idx.push(i);
  });
  return lines;
}

const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- Crop box ----------
export function CropPanel({ videoUrl, vertical, value, onChange }) {
  const frameAR = vertical ? 9 / 16 : 16 / 9;
  const boxRef = useRef(null);
  const drag = useRef(null);
  const [aspect, setAspect] = useState(value?.aspect || (vertical ? '9:16' : '16:9'));
  const crop = value ? { x: value.x, y: value.y, w: value.w, h: value.h } : { x: 0, y: 0, w: 1, h: 1 };
  const ratio = (ASPECTS.find(a => a[0] === aspect) || [])[1] || 0;
  const set = (c, asp = aspect) => onChange({ x: r4(c.x), y: r4(c.y), w: r4(c.w), h: r4(c.h), aspect: asp });
  const pickAspect = (name) => { setAspect(name); const r = (ASPECTS.find(a => a[0] === name) || [])[1]; set(r ? fitAspect(r, frameAR, value ? crop : null) : crop, name); };

  const onDown = (mode) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const rect = boxRef.current.getBoundingClientRect();
    drag.current = { mode, sx: e.clientX, sy: e.clientY, c0: { ...crop }, rect, id: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    const dx = (e.clientX - d.sx) / d.rect.width, dy = (e.clientY - d.sy) / d.rect.height;
    const c = { ...d.c0 }; const MIN = 0.15;
    if (d.mode === 'move') { c.x = clamp(d.c0.x + dx, 0, 1 - c.w); c.y = clamp(d.c0.y + dy, 0, 1 - c.h); }
    else {
      const left = d.mode[1] === 'l', top = d.mode[0] === 't';
      // Anchor = opposite corner.
      const ax = left ? d.c0.x + d.c0.w : d.c0.x, ay = top ? d.c0.y + d.c0.h : d.c0.y;
      let w = clamp(left ? d.c0.w - dx : d.c0.w + dx, MIN, left ? ax : 1 - ax);
      let h = clamp(top ? d.c0.h - dy : d.c0.h + dy, MIN, top ? ay : 1 - ay);
      if (ratio) {
        const k = frameAR / ratio; // h = w * k in fractions
        const maxW = Math.min(left ? ax : 1 - ax, (top ? ay : 1 - ay) / k);
        w = clamp(Math.max(w, h / k), Math.max(MIN, MIN / k), maxW); h = w * k;
      }
      c.w = w; c.h = h; c.x = left ? ax - w : ax; c.y = top ? ay - h : ay;
    }
    set(c);
  };
  const onUp = (e) => { if (drag.current?.id === e.pointerId) drag.current = null; };
  const full = !value || (crop.w > 0.998 && crop.h > 0.998);
  const handle = (pos) => (
    <span key={pos} data-testid={`crop-handle-${pos}`} onPointerDown={onDown(pos)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      className="absolute z-10 h-11 w-11" style={{ touchAction: 'none', [pos[0] === 't' ? 'top' : 'bottom']: -4, [pos[1] === 'l' ? 'left' : 'right']: -4 }}>
      <span className="absolute h-5 w-5 rounded-full border-2 border-black bg-lime" style={{ [pos[0] === 't' ? 'top' : 'bottom']: 0, [pos[1] === 'l' ? 'left' : 'right']: 0 }} />
    </span>
  );
  return (
    <section className="flex flex-col gap-3" aria-label="Crop">
      <h4 className="text-[15px] font-bold text-white">Crop</h4>
      <span className="text-sm text-muted">Drag the box to keep just the part you want (for example, crop out another creator). Drag the corners to resize.</span>
      <div ref={boxRef} data-testid="crop-stage" className={`relative mx-auto w-full select-none overflow-hidden rounded-xl bg-black ${vertical ? 'max-w-[240px]' : ''}`} style={{ aspectRatio: vertical ? '9 / 16' : '16 / 9', touchAction: 'none' }}>
        {videoUrl && <video src={videoUrl} muted playsInline loop autoPlay className="pointer-events-none h-full w-full object-cover" />}
        <div data-testid="crop-box" onPointerDown={onDown('move')} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          className="absolute border-2 border-lime" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%`, boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)', touchAction: 'none', cursor: 'move' }}>
          {['tl', 'tr', 'bl', 'br'].map(handle)}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {ASPECTS.map(([name]) => <button key={name} type="button" aria-pressed={aspect === name} onClick={() => pickAspect(name)} className={`min-h-[44px] rounded-full border px-4 py-2 text-[15px] ${aspect === name ? 'border-lime bg-lime/10 text-lime' : 'border-line2 text-fg'}`}>{name}</button>)}
        <button type="button" data-testid="crop-reset" onClick={() => { setAspect(vertical ? '9:16' : '16:9'); onChange(null); }} className="min-h-[44px] rounded-full border border-line2 px-4 py-2 text-[15px] text-fg">Reset</button>
      </div>
      <span className="text-sm text-muted">{full ? 'No crop. The whole frame is used.' : 'Areas outside the box are removed. Any leftover space gets a blurred fill.'}</span>
    </section>
  );
}

// ---------- Transcript cuts ----------
export function CutPanel({ words, cutSet, onChange, onSeek }) {
  const [open, setOpen] = useState(-1);
  const lines = toLines(words);
  const speakers = [...new Set(words.map(w => w.spk).filter(s => s != null))];
  const toggle = (idx, on) => { const n = new Set(cutSet); idx.forEach(i => (on ? n.add(i) : n.delete(i))); onChange(n); };
  const ranges = cutRanges(words, cutSet);
  const removed = ranges.reduce((s, [a, b]) => s + b - a, 0);
  if (!words.length) return (
    <section className="flex flex-col gap-2" aria-label="Remove speech">
      <h4 className="text-[15px] font-bold text-white">Remove talking</h4>
      <span className="text-sm text-muted">This clip has no word-by-word transcript, so lines can&apos;t be cut here. Use Crop to remove another creator from the frame.</span>
    </section>
  );
  return (
    <section className="flex flex-col gap-3" aria-label="Remove speech">
      <h4 className="text-[15px] font-bold text-white">Remove talking</h4>
      <span className="text-sm text-muted">Tap a line to cut it from the video (for example, when another creator is talking). Tap again to bring it back. Use ✎ to cut single words.</span>
      {speakers.length > 1 && <div className="flex flex-wrap gap-2">{speakers.map(s => {
        const idx = words.map((w, i) => (w.spk === s ? i : -1)).filter(i => i >= 0);
        const all = idx.every(i => cutSet.has(i));
        return <button key={s} type="button" onClick={() => toggle(idx, !all)} className={`min-h-[44px] rounded-full border px-4 py-2 text-[15px] ${all ? 'border-red-400 text-red-300' : 'border-line2 text-fg'}`}>{all ? `Restore Speaker ${s}` : `Remove all lines from Speaker ${s}`}</button>;
      })}</div>}
      <ul data-testid="cut-lines" className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto overscroll-contain">
        {lines.map((ln, li) => {
          const all = ln.idx.every(i => cutSet.has(i)); const some = !all && ln.idx.some(i => cutSet.has(i));
          const t0 = Number(words[ln.idx[0]].a) || 0;
          return (
            <li key={li} className={`rounded-xl border ${all ? 'border-red-400/60 bg-red-500/10' : 'border-line2'}`}>
              <div className="flex items-stretch">
                <button type="button" data-testid="cut-line" aria-pressed={all} onClick={() => { toggle(ln.idx, !all); }} className="flex min-h-[48px] flex-1 items-start gap-2 px-3 py-2 text-left text-[15px]">
                  <span className="shrink-0 pt-[2px] font-mono text-xs text-muted">{fmt(t0)}{ln.spk != null ? ` · S${ln.spk}` : ''}</span>
                  <span className={all ? 'text-red-300 line-through' : 'text-fg'}>{ln.idx.map(i => <span key={i} className={cutSet.has(i) ? 'text-red-300 line-through' : ''}>{words[i].w} </span>)}{some && <span className="text-xs text-red-300">(partly cut)</span>}</span>
                </button>
                <button type="button" aria-label="Play this line" onClick={() => onSeek?.(t0)} className="w-11 shrink-0 border-l border-line2 text-muted">▶</button>
                <button type="button" aria-label="Cut single words" aria-expanded={open === li} onClick={() => setOpen(open === li ? -1 : li)} className="w-11 shrink-0 border-l border-line2 text-muted">✎</button>
              </div>
              {open === li && <div className="flex flex-wrap gap-2 border-t border-line2 p-2">{ln.idx.map(i => (
                <button key={i} type="button" data-testid="cut-word" aria-pressed={cutSet.has(i)} onClick={() => toggle([i], !cutSet.has(i))} className={`min-h-[40px] rounded-full border px-3 text-[15px] ${cutSet.has(i) ? 'border-red-400 text-red-300 line-through' : 'border-line2 text-fg'}`}>{words[i].w}</button>
              ))}</div>}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <span data-testid="cut-summary" className="text-sm text-muted">{ranges.length ? `Cutting ${ranges.length} part${ranges.length > 1 ? 's' : ''} (${removed.toFixed(1)}s). Captions shift to match.` : 'Nothing cut yet.'}</span>
        {cutSet.size > 0 && <button type="button" onClick={() => onChange(new Set())} className="min-h-[44px] rounded-full border border-line2 px-4 text-[15px] text-fg">Undo all cuts</button>}
      </div>
    </section>
  );
}

// Preview playback that jumps over cut ranges (original clip timeline).
export function useSkipCuts(ref, ranges, active) {
  useEffect(() => {
    const v = ref.current; if (!v || !active || !ranges.length) return;
    const on = () => { const t = v.currentTime; const r = ranges.find(([a, b]) => t >= a && t < b - 0.03); if (r) v.currentTime = r[1]; };
    v.addEventListener('timeupdate', on);
    return () => v.removeEventListener('timeupdate', on);
  }, [ref, active, JSON.stringify(ranges)]);
}

// Crop + cuts state for one clip, saved per clip on this device (and with the clip on render).
export function useClipEdits(clip, words) {
  const key = `viral_edit_${clip.id || `${clip.title}_${clip.startSec}`}`;
  const [init] = useState(() => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } });
  const [userCrop, setUserCrop] = useState(init && 'userCrop' in init ? init.userCrop : (clip.userCrop || null));
  const [cutSet, setCutSet] = useState(() => { const r = init?.cuts || clip.cuts || []; return new Set(words.map((w, i) => (inRanges((Number(w.a) + Number(w.b)) / 2, r) ? i : -1)).filter(i => i >= 0)); });
  const cuts = cutRanges(words, cutSet);
  const sig = JSON.stringify({ userCrop, cuts });
  useEffect(() => { try { localStorage.setItem(key, sig); } catch {} }, [key, sig]);
  return { userCrop, setUserCrop, cutSet, setCutSet, cuts };
}
