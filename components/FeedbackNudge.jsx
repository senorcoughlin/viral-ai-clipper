'use client';
import { useEffect, useState } from 'react';
const KEY = 'vac:feedback-nudge-dismissed';
export default function FeedbackNudge() {
  const [show, setShow] = useState(false);
  useEffect(() => { try { setShow(!localStorage.getItem(KEY)); } catch {} }, []);
  if (!show) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch {} setShow(false); };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-line2 bg-surface p-3 text-sm text-soft">
      <span className="min-w-0 flex-1">How did these clips turn out? A quick note helps us make them better.</span>
      <a href="/feedback?from=clips" onClick={dismiss} className="font-semibold text-lime no-underline">Share feedback</a>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="px-1 text-muted hover:text-fg">✕</button>
    </div>
  );
}
