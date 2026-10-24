'use client';
import { useEffect, useState } from 'react';

export const REUSE_URL = 'https://support.google.com/youtube/answer/1311392';
const CREDIT_KEY = 'viral_auto_credit';

export function autoCreditOn() {
  try { return localStorage.getItem(CREDIT_KEY) !== 'off'; } catch { return true; }
}
export function setAutoCredit(on) { try { localStorage.setItem(CREDIT_KEY, on ? 'on' : 'off'); } catch {} }

// Creator of the clip's source video (YouTube oEmbed), for the auto credit line.
export function useCredit(source) {
  const [credit, setCredit] = useState(null);
  useEffect(() => {
    if (!source || !/youtu\.?be/.test(source)) return;
    let live = true;
    fetch('/api/credit?url=' + encodeURIComponent(source)).then(r => r.json())
      .then(d => { if (live && d?.success && d.author) setCredit({ author: d.author, authorUrl: d.authorUrl }); }).catch(() => {});
    return () => { live = false; };
  }, [source]);
  return credit;
}

export function creditLine(c) { return c?.author ? `Credit: ${c.author}${c.authorUrl ? ' ' + c.authorUrl : ''}` : ''; }

export function withCredit(text, credit, on = autoCreditOn()) {
  const line = creditLine(credit);
  if (!on || !line || String(text || '').includes(line)) return text || '';
  return [String(text || '').trim(), line].filter(Boolean).join('\n\n');
}

// Missing transformative elements that raise YouTube "reused content" risk.
export function reuseRisks(clip, t = {}) {
  const hasCaptions = !!clip?.subtitlesEnabled || (Array.isArray(clip?.words) && clip.words.length > 0);
  const out = [];
  if (!hasCaptions) out.push('No captions');
  if (!t.hook && !t.overlay) out.push('No hook text or facecam overlay');
  if (!t.commentary) out.push('No commentary voiceover');
  return out.length === 3 ? out : [];
}

export function PreUploadWarning({ risks, onProceed, onCancel }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Before you upload" className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" onClick={onCancel}>
      <div className="card flex w-full max-w-md flex-col gap-3 p-5" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-lg font-extrabold text-white">This clip may count as reused content</h3>
        <ul className="list-disc pl-5 text-sm text-soft">{risks.map(r => <li key={r}>{r}</li>)}</ul>
        <p className="text-xs text-muted">YouTube doesn&apos;t monetize channels that mainly repost other people&apos;s videos without adding something meaningful, like commentary, edits or your own take. Clips like this can also be claimed by Content ID. Adding captions, a hook, a facecam reaction or a commentary voiceover (Edit → Transform) helps, and so does having the streamer&apos;s permission.</p>
        <a href={REUSE_URL} target="_blank" rel="noreferrer" className="text-xs font-semibold text-lime">Read YouTube&apos;s reused content policy →</a>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} className="btn-lime h-10 flex-1 text-sm">Go back and edit</button>
          <button type="button" onClick={onProceed} className="btn-ghost h-10 flex-1 text-sm">Upload anyway</button>
        </div>
      </div>
    </div>
  );
}
