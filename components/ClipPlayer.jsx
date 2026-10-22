'use client';

import { useState, useRef } from 'react';
import ViralScoreMeter, { scoreTier } from './ViralScoreMeter';

const FORMAT_LABEL = { shorts_9_16: '9:16', landscape_16_9: '16:9', square_1_1: '1:1' };
const ASPECT = { shorts_9_16: 'aspect-[9/12]', landscape_16_9: 'aspect-[16/10]', square_1_1: 'aspect-square' };

// Public sample videos for demo playback until real generation is wired
const SAMPLE_VIDEOS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
];

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
  play: <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>,
};

export default function ClipPlayer({ clip }) {
  const [copied, setCopied] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [title, setTitle] = useState(clip.title || 'Untitled');
  const [timestamp, setTimestamp] = useState(clip.timestamp || clip.duration || '0:00');
  const [socialCaption, setSocialCaption] = useState(clip.socialCaption || clip.caption || '');
  const [aiPrompt, setAiPrompt] = useState(clip.aiPrompt || clip.hook || '');
  const videoRef = useRef(null);

  const videoSrc = clip.videoUrl || SAMPLE_VIDEOS[(clip.id || 0) % SAMPLE_VIDEOS.length];

  const copy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const score = clip.viralScore || clip.score || 90;
  const { color, label } = scoreTier(score);
  const hookText = (socialCaption || '').replace(/#\S+/g, '').replace(/[^\w\s'!?.,-]/g, '').trim();
  const hookPct = Math.min(100, score + 2);
  const pacePct = Math.max(60, score - 5);

  return (
    <article className="group card flex flex-col overflow-hidden transition hover:-translate-y-1 hover:border-lime animate-fadeup">
      {/* Preview / Player */}
      <div className={`relative ${ASPECT[clip.format] || ASPECT.shorts_9_16} border-b border-line bg-black cursor-pointer`} onClick={togglePlay}>
        <video
          ref={videoRef}
          src={videoSrc}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          preload="metadata"
          onEnded={() => setIsPlaying(false)}
        />
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-lime text-ink shadow-lg">
              {Icon.play}
            </div>
          </div>
        )}
        <div className="absolute left-3.5 top-3.5 flex gap-1.5 pointer-events-none">
          <span className="rounded-full border border-line2 bg-ink/85 px-2 py-1 font-mono text-[11px]">{timestamp}</span>
          <span className="rounded-full border border-line2 bg-ink/85 px-2 py-1 text-[11px] font-semibold">{FORMAT_LABEL[clip.format] || '9:16'}</span>
        </div>
        <div className="absolute right-3.5 top-3.5 pointer-events-none"><ViralScoreMeter score={score} size={56} /></div>
        {clip.hookEnabled && !isPlaying && (
          <div className="absolute left-1/2 top-[22%] -translate-x-1/2 rounded-md bg-hot px-2 py-1 font-display text-[11px] font-extrabold uppercase tracking-wide text-white pointer-events-none">
            Wait for it
          </div>
        )}
        {clip.subtitlesEnabled && !isPlaying && (
          <p className="absolute inset-x-3.5 bottom-4 text-center font-display text-[17px] font-extrabold uppercase leading-[1.05] text-white [text-shadow:0_2px_12px_rgba(0,0,0,.8)] pointer-events-none">
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
