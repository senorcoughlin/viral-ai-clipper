'use client';

import { useState, useRef, useEffect } from 'react';
import ViralScoreMeter, { scoreTier } from './ViralScoreMeter';
import ClipEditor from './ClipEditor';
import { useCredit, withCredit, autoCreditOn, setAutoCredit, creditLine, reuseRisks, PreUploadWarning } from './PostCheck';

const FORMAT_LABEL = { shorts_9_16: '9:16', landscape_16_9: '16:9', square_1_1: '1:1' };
const ASPECT = { shorts_9_16: 'aspect-[9/12]', landscape_16_9: 'aspect-[16/10]', square_1_1: 'aspect-square' };

// Public sample videos for demo playback until real generation is wired
const SAMPLE_VIDEOS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4',
  'https://filesamples.com/samples/video/mp4/sample_640x360.mp4',
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
  download: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
};


const slug = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '');
const stamp = () => { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`; };
export const clipFileName = (title, n) => ['viral-clip', slug(title), n, stamp()].filter(Boolean).join('-') + '.mp4';
export const downloadHref = (src, name) => /^https:\/\/(renderio\.dev\/api\/media\/|[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/)/.test(src || '')
  ? `/api/download?${new URLSearchParams({ u: src.split('#')[0], n: name })}` : src;

export default function ClipPlayer({ clip, compact = false, index }) {
  const [copied, setCopied] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [srcIndex, setSrcIndex] = useState(0);
  const [poster, setPoster] = useState('');
  const [title, setTitle] = useState(clip.title || 'Untitled');
  const [timestamp, setTimestamp] = useState(clip.timestamp || clip.duration || '0:00');
  const [socialCaption, setSocialCaption] = useState(clip.socialCaption || clip.caption || '');
  const [aiPrompt, setAiPrompt] = useState(clip.aiPrompt || clip.hook || '');
  const videoRef = useRef(null);
  const [renderedUrl, setRenderedUrl] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [transform, setTransform] = useState({ hook: '', overlay: false, commentary: false });
  const [pendingPost, setPendingPost] = useState(null);
  const [postMsg, setPostMsg] = useState(null);
  const [postBusy, setPostBusy] = useState(false);
  const [creditOn, setCreditOn] = useState(true);
  const credit = useCredit(clip.source);
  const [showMonetize, setShowMonetize] = useState(false);
  useEffect(() => { setCreditOn(autoCreditOn()); try { setShowMonetize(localStorage.getItem('viral_hide_monetize') !== '1' && localStorage.getItem('viral_hide_monetize_' + clip.id) !== '1'); } catch {} }, [clip.id]);
  const monetizeHref = '/monetize?' + new URLSearchParams({ clip: String(clip.id || ''), src: clip.source || '', title: clip.title || '' });

  const videoSrc = renderedUrl || (srcIndex === 0 && clip.videoUrl ? clip.videoUrl : null) || SAMPLE_VIDEOS[srcIndex % SAMPLE_VIDEOS.length];

  const onDownload = (e) => {
    const name = clipFileName(clip.title || title, (index ?? 0) + 1);
    e.currentTarget.href = downloadHref(videoSrc, name);
    e.currentTarget.download = name;
  };
  const copy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  };

  const capturePoster = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    try {
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      setPoster(c.toDataURL('image/jpeg', 0.7));
    } catch {}
  };

  const togglePlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (v.paused) {
        await v.play();
        setIsPlaying(true);
      } else {
        v.pause();
        setIsPlaying(false);
      }
    } catch (err) {
      console.error('play failed', err);
      setIsPlaying(false);
    }
  };

  const postClip = async (platform, checked = false) => {
    const risks = platform === 'youtube' ? reuseRisks(clip, transform) : [];
    if (!checked && risks.length) { setPendingPost({ platform, risks }); return; }
    setPendingPost(null);
    if (platform === 'youtube') { setPostBusy(true); setPostMsg(null); }
    const text = withCredit(socialCaption, credit, creditOn);
    try {
      copy(text, platform);
      const res = await fetch('/api/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, caption: text, videoUrl: videoSrc, title }),
      });
      const data = await res.json();
      const d = data?.data || {};
      if (platform === 'youtube') {
        if (d.mode === 'youtube-uploaded' || d.mode === 'youtube-scheduled') setPostMsg({ ok: true, text: 'Uploaded to your YouTube as private. Review and publish in Studio.', url: d.url });
        else if (d.why === 'not_connected') setPostMsg({ ok: false, text: 'Connect YouTube once and this button uploads the clip for you. Caption copied.', connect: true });
        else if (d.why === 'not_authorized') setPostMsg({ ok: false, text: 'YouTube refused the upload (sign-in expired or this Google account is not approved yet). Reconnect, or upload manually — caption copied.', connect: true, url: d.url });
        else setPostMsg({ ok: false, text: 'Auto-upload failed. Caption copied — upload it in YouTube Studio.', url: d.url || 'https://studio.youtube.com/' });
        setPostBusy(false);
        return;
      }
      if (data.success && d.url) window.open(d.url, '_blank');
    } catch {
      if (platform === 'youtube') { setPostBusy(false); setPostMsg({ ok: false, text: 'Could not reach the uploader. Caption copied — upload it in YouTube Studio.', url: 'https://studio.youtube.com/' }); return; }
      window.open(platform === 'youtube' ? 'https://studio.youtube.com/' : 'https://www.tiktok.com/upload', '_blank');
    }
  };

  const postStatus = postMsg && (
          <div role="status" className={`rounded-input border px-3 py-2 text-xs leading-relaxed ${postMsg.ok ? 'border-lime text-lime' : 'border-line2 text-soft'}`}>
            {postMsg.text}{' '}
            {postMsg.url && <a href={postMsg.url} target="_blank" rel="noreferrer" className="underline">Open Studio</a>}
            {postMsg.connect && <> {postMsg.url ? '· ' : ''}<a href={`/api/youtube/start?next=${typeof window !== 'undefined' ? window.location.pathname : '/'}`} className="underline">Connect YouTube</a></>}
          </div>
        );

  const unscored = clip.scored === false;
  const score = unscored ? 0 : (clip.viralScore || clip.score || 70);
  const tier = scoreTier(score);
  const color = unscored ? '#8A8A99' : tier.color;
  const label = unscored ? 'Not scored' : tier.label;
  const hookText = (socialCaption || '').replace(/#\S+/g, '').replace(/[^\w\s'!?.,-]/g, '').trim();
  const hookPct = Math.min(100, score + 2);
  const pacePct = Math.max(60, score - 5);

  return (
    <article className={`group card flex flex-col overflow-hidden transition hover:-translate-y-1 hover:border-lime animate-fadeup ${compact ? 'max-w-[180px]' : ''}`}>
      {/* Preview / Player */}
      <div className={`relative ${compact ? 'aspect-[9/14]' : (ASPECT[clip.format] || ASPECT.shorts_9_16)} border-b border-line bg-black`}>
        <video
          ref={videoRef}
          src={videoSrc && !videoSrc.includes('#') ? `${videoSrc}#t=0.1` : videoSrc}
          poster={poster || undefined}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          controls={isPlaying}
          preload="metadata"
          muted
          onLoadedData={capturePoster}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onError={() => setSrcIndex(i => i + 1)}
        />
        {!isPlaying && (
          <button
            type="button"
            onClick={togglePlay}
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/35"
            aria-label="Play clip"
          >
            {poster && (
              <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
            )}
            <span className={`relative grid place-items-center rounded-full bg-lime text-ink shadow-lg ring-4 ring-black/30 ${compact ? 'h-10 w-10' : 'h-16 w-16'}`}>
              {Icon.play}
            </span>
          </button>
        )}
        <div className="absolute left-3.5 top-3.5 flex gap-1.5 pointer-events-none">
          <span className="rounded-full border border-line2 bg-ink/85 px-2 py-1 font-mono text-[11px]">{timestamp}</span>
          <span className="rounded-full border border-line2 bg-ink/85 px-2 py-1 text-[11px] font-semibold">{FORMAT_LABEL[clip.format] || '9:16'}</span>
        </div>
        {!unscored && <div className="absolute right-3.5 top-3.5 pointer-events-none"><ViralScoreMeter score={score} size={56} /></div>}
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
      {compact ? (
        <div className="flex flex-col gap-1 p-2.5">
          <p className="line-clamp-2 text-xs font-bold text-white">{title}</p>
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span style={{ color }}>{label}</span>
            <span className="flex gap-2">
              {clip.source && !clip.preview && <button type="button" onClick={() => setEditorOpen(true)} className="font-semibold text-soft hover:text-lime">Edit</button>}
              <a href={videoSrc} download={`${title || 'clip'}.mp4`} onClick={onDownload} rel="noreferrer" className="font-semibold text-lime hover:underline">Download</a>
            </span>
          </div>
          <button type="button" onClick={() => postClip('youtube')} disabled={postBusy} className="btn-ghost mt-1 h-8 w-full px-2 text-[11px]">{postBusy ? 'Uploading…' : 'Upload to YouTube Shorts'}</button>
          <p className="text-[10px] leading-snug text-muted">Opens app, caption copied — attach the downloaded clip:</p>
          <div className="grid grid-cols-3 gap-1">
            <button type="button" onClick={() => postClip('tiktok')} className="btn-ghost h-7 min-w-0 px-1 text-[10px]">TikTok</button>
            <button type="button" onClick={() => { copy(withCredit(socialCaption, credit, creditOn), 'reels'); window.open('https://www.instagram.com/', '_blank'); }} className="btn-ghost h-7 min-w-0 px-1 text-[10px]">Reels</button>
            <button type="button" onClick={() => { copy(withCredit(socialCaption, credit, creditOn), 'x'); window.open('https://x.com/compose/post', '_blank'); }} className="btn-ghost h-7 min-w-0 px-1 text-[10px]">X</button>
          </div>
          {postStatus && <div className="break-words text-[10px] [&>div]:px-2 [&>div]:py-1.5 [&>div]:text-[10px]">{postStatus}</div>}
        </div>
      ) : (
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
            {clip.reason && <p className="text-xs leading-relaxed text-muted">Why this score: {clip.reason}</p>}
            {clip.reasons && (
              <ul className="flex flex-col gap-1 text-xs leading-snug text-soft">
                {[['hook', 'Hook'], ['pacing', 'Pacing'], ['emotion', 'Emotion/CTA']].filter(([k]) => clip.reasons[k]).map(([k, l]) => (
                  <li key={k} className="min-w-0 break-words"><span className="font-semibold text-lime">{l}:</span> {clip.reasons[k]}</li>
                ))}
              </ul>
            )}
            {socialCaption && <p className="text-sm leading-relaxed text-soft">“{socialCaption}”</p>}
            {Array.isArray(clip.hooks) && clip.hooks.length > 1 && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">Hook variants</span>
                {clip.hooks.map((h, i) => (
                  <button key={i} type="button" onClick={() => setSocialCaption(h)} className="rounded-input border border-line2 px-2 py-1 text-left text-xs text-soft hover:border-lime">{h}</button>
                ))}
              </div>
            )}
            {(clip.hashtags || clip.bestTime) && (
              <div className="flex flex-wrap gap-2 text-[11px] text-muted">
                {clip.hashtags && <span className="text-lime">{clip.hashtags}</span>}
                {clip.bestTime && <span>Best time · {clip.bestTime}</span>}
              </div>
            )}
            {aiPrompt && (
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-[#A48CFF]">
                <span className="mt-0.5 shrink-0">{Icon.sparkle}</span>{aiPrompt}
              </p>
            )}
          </>
        )}

        {postStatus}
        <Bar label="Hook" pct={hookPct} color={color} />
        <Bar label="Pacing" pct={pacePct} color={color} />

        <p className="text-[11px] leading-snug text-muted">Shorts uploads directly to your connected channel. TikTok, Reels and X open the app with your caption copied, so download the clip first.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => copy(withCredit(socialCaption, credit, creditOn), 'cap')} className="btn-lime h-10 flex-1 text-sm">
            {copied === 'cap' ? 'Copied!' : 'Copy caption'}
          </button>
          <button type="button" onClick={() => postClip('tiktok')} className="btn-ghost h-10 px-3 text-xs">TikTok</button>
          <button type="button" onClick={() => { copy(withCredit(socialCaption, credit, creditOn), 'reels'); window.open('https://www.instagram.com/', '_blank'); }} className="btn-ghost h-10 px-3 text-xs">Reels</button>
          <button type="button" onClick={() => postClip('youtube')} disabled={postBusy} className="btn-ghost h-10 px-3 text-xs">{postBusy ? 'Uploading…' : 'Upload to Shorts'}</button>
          <button type="button" onClick={() => { copy(withCredit(socialCaption, credit, creditOn), 'x'); window.open('https://x.com/compose/post', '_blank'); }} className="btn-ghost h-10 px-3 text-xs">X</button>
          <a href={videoSrc} download={`${title || 'clip'}.mp4`} onClick={onDownload} rel="noreferrer" aria-label="Download clip" title="Download" className="btn-ghost grid h-10 w-10 place-items-center p-0">
            {Icon.download}
          </a>
          <button type="button" aria-label="Copy AI prompt" title="Copy AI prompt" onClick={() => copy(aiPrompt, 'prompt')} className="btn-ghost h-10 w-10 p-0">
            {copied === 'prompt' ? Icon.check : Icon.copy}
          </button>
          <button type="button" aria-label={isEditing ? 'Done editing' : 'Edit clip'} title={isEditing ? 'Done' : 'Edit'} onClick={() => setIsEditing(v => !v)} className={`btn-ghost h-10 w-10 p-0 ${isEditing ? 'border-lime text-lime' : ''}`}>
            {isEditing ? Icon.check : Icon.edit}
          </button>
        </div>
      </div>
      )}
      {showMonetize && clip.videoUrl && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/60 px-4 py-2 text-[11px]">
          <a href={monetizeHref} className="font-semibold text-lime no-underline">Monetize this clip →</a>
          <button type="button" onClick={() => { try { localStorage.setItem('viral_hide_monetize_' + clip.id, '1'); } catch {} setShowMonetize(false); }} className="text-muted hover:text-fg" aria-label="Dismiss">✕</button>
          <button type="button" onClick={() => { try { localStorage.setItem('viral_hide_monetize', '1'); } catch {} setShowMonetize(false); }} className="text-muted hover:text-fg">Don&apos;t show again</button>
        </div>
      )}
      {credit && (
        <label className="flex items-center gap-2 border-t border-line/60 px-4 py-2 text-[11px] text-muted">
          <input type="checkbox" checked={creditOn} onChange={e => { setCreditOn(e.target.checked); setAutoCredit(e.target.checked); }} />
          <span>Add credit when posting: <span className="text-soft">{creditLine(credit)}</span></span>
        </label>
      )}
      {pendingPost && <PreUploadWarning risks={pendingPost.risks} onCancel={() => setPendingPost(null)} onProceed={() => postClip(pendingPost.platform, true)} />}
      {editorOpen && <ClipEditor clip={clip} videoUrl={videoSrc} credit={creditOn ? credit : null} transform={transform} onTransform={setTransform} onRendered={(u) => { setRenderedUrl(u); setSrcIndex(0); videoRef.current?.load?.(); }} onClose={() => setEditorOpen(false)} />}
    </article>
  );
}
