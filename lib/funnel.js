'use client';
// Funnel events: Vercel Web Analytics custom event + first-party Redis counter.
import { track } from '@vercel/analytics';

// track() silently drops events when window.va isn't defined yet (page effects run
// before the layout's <Analytics/> injects it). Pre-create the same queue it uses.
function ensureQueue() {
  if (typeof window === 'undefined' || window.va) return;
  window.va = function (...p) { (window.vaq = window.vaq || []).push(p); };
}

export function funnel(name, props) {
  if (typeof window === 'undefined') return;
  try { ensureQueue(); track(name, props); } catch {}
  try {
    const body = JSON.stringify({ name });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }));
    else fetch('/api/event', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
  } catch {}
}
