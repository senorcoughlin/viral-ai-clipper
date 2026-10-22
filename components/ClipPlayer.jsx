'use client';

import { useState } from 'react';
import ViralScoreMeter, { scoreTier } from './ViralScoreMeter';

const FORMAT_LABEL = { shorts_9_16: '9:16', landscape_16_9: '16:9', square_1_1: '1:1' };
const ASPECT = { shorts_9_16: 'aspect-[9/12]', landscape_16_9: 'aspect-[16/10]', square_1_1: 'aspect-square' };

function Bar({ label, pct, color }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[11px] text-muted">
        <span>{label}</span><span className="font-mono">{pct}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[#1E1E29]">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

const Icon = {
  copy: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" stroke="currentColor" strokeWidth="2" /></svg>,
  edit: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 20h4l10-10-4-4L4 16v4zM13 7l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  check: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="m5 12 5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  sparkle: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 3v4m0 10v4M3 12h4m10 0h4M6.3 6.3l2.8 2.8m5.8 5.8 2.8 2.8M6.3 17.7l2.8-2.8m5.8-5.8 2.8-2.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
};

export default function ClipPlayer({ clip }) {
  const [copied, setCopied] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(clip.title);
  const [timestamp, setTimestamp] = useState(clip.timestamp);
  const [socialCaption, setSocialCaption] = useState(clip.socialCaption || '');
  const [aiPrompt, setAiPrompt] = useState(clip.aiPrompt || '');

  const copy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  };

  const score = clip.viralScore || 90;
  const { color, label } = scoreTier(score);
  const hookText = (socialCaption || '').replace(/#\S+/g, '').replace(/[^\w\s'!?.,-]/g, '').trim();
  // Derived sub-scores so the bars feel tied to the headline number
  const hookPct = Math.min(100, score + 2);
  const pacePct = Math.max(60, score - 5 + ((clip.id || 0) % 7));

  return (
    <article className="group card flex flex-col overflow-hidden transition hover:-translate-y-1 hover:border-lime animate-fadeup">
      {/* Preview */}
      <div className={`relative ${ASPECT[clip.format] || ASPECT.shorts_9_16} border-b border-line bg-[#0F0F16]`}>
        <div aria-hidden className="absolute inset-0 bg-dots [background-size:14px_14px] opacity-70" />
        <div className="absolute left-3.5 top-3.5 flex gap-1.5">
          <span className="rounded-full border border-line2 bg-ink/85 px-2 py-1 font-mono text-[11px]">{timestamp}</span>
          <span className="rounded-full border border-line2 bg-ink/85 px-2 py-1 text-[11px] font-semibold">{FORMAT_LABEL[clip.format] || '9:16'}</span>
        </div>
        <div className="absolute right-3.5 top-3.5"><ViralScoreMeter score={score} size={56} /></div>

        {/* waveform */}
        <div className="wave absolute inset-x-4 top-[46%] flex h-10 items-end gap-1" aria-hidden>
          {Array.from({ length: 22 }, (_, i) => (
            <span key={i} className="h-10" style={{ animationDelay: `${(i * 137) % 1100}ms` }} />
          ))}
        </div>

        {clip.hookEnabled && (
          <div className="absolute left-1/2 top-[22%] -translate-x-1/2 rounded-md bg-hot px-2 py-1 font-display text-[11px] font-extrabold uppercase tracking-wide text-white">
            Wait for it
          </div>
        )}
        {clip.subtitlesEnabled && (
          <p className="absolute inset-x-3.5 bottom-4 text-center font-display text-[17px] font-extrabold uppercase leading-[1.05] text-white [text-shadow:0_2px_12px_rgba(0,0,0,.8)]">
            {hookText || 'This changes everything'}
          </p>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[.08em]" style={{ color }}>{label}</span>
          <span className="text-xs text-muted">{FORMAT_LABEL[clip.format] || '9:16'} · {clip.subtitlesEnabled ? 'captions' : 'no captions'}</span>
        </div>

        {isEditing ? (
          <div className="flex flex-col gap-2">
            <input value={title} onChange={e => setTitle(e.target.value)} aria-label="Clip title" className="w-full rounded-input border border-line2 bg-ink px-3 py-2 text-sm outline-none focus:border-lime" />
            <input value={timestamp} onChange={e => setTimestamp(e.target.value)} aria-label="Timestamp" className="w-36 rounded-input border border-line2 bg-ink px-3 py-2 font-mono text-xs outline-none focus:border-lime" />
            <input value={socialCaption} onChange={e => setSocialCaption(e.target.value)} aria-label="Caption" className="w-full rounded-input border border-line2 bg-ink px-3 py-2 text-sm outline-none focus:border-lime" />
            <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} aria-label="AI prompt" className="w-full rounded-input border border-line2 bg-ink px-3 py-2 text-sm outline-none focus:border-lime" />
          </div>
        ) : (
          <>
            <h3 className="truncate text-sm font-semibold text-fg">{title}</h3>
            {socialCaption && <p className="text-sm leading-relaxed text-soft">“{socialCaption}”</p>}
            {aiPrompt && (
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-[#A48CFF]">
                <span className="mt-0.5 shrink-0">{Icon.sparkle}</span>{aiPrompt}
              </p>
            )}
          </>
        )}

        <Bar label="Hook" pct={hookPct} color={color} />
        <Bar label="Pacing" pct={pacePct} color={color} />

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => copy(socialCaption, 'cap')} className="btn-lime h-10 flex-1 text-sm">
            {copied === 'cap' ? 'Copied!' : 'Copy caption'}
          </button>
          <button type="button" aria-label="Copy AI prompt" title="Copy AI prompt" onClick={() => copy(aiPrompt, 'prompt')} className="btn-ghost h-10 w-10 p-0">
            {copied === 'prompt' ? Icon.check : Icon.copy}
          </button>
          <button type="button" aria-label={isEditing ? 'Done editing' : 'Edit clip'} title={isEditing ? 'Done' : 'Edit'} onClick={() => setIsEditing(v => !v)} className={`btn-ghost h-10 w-10 p-0 ${isEditing ? 'border-lime text-lime' : ''}`}>
            {isEditing ? Icon.check : Icon.edit}
          </button>
        </div>
      </div>
    </article>
  );
}
