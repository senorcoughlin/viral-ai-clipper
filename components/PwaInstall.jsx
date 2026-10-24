'use client';
import { useEffect, useState } from 'react';

const KEY = 'vac_install_dismissed';
let deferred = null;
const subs = new Set();
const emit = () => subs.forEach(f => f());

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force(n => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const standalone = mounted && isStandalone();
  const ios = mounted && isIOS();
  return {
    canPrompt: !!deferred && !standalone,
    ios: ios && !standalone,
    standalone,
    async prompt() {
      if (!deferred) return false;
      deferred.prompt();
      try { await deferred.userChoice; } catch {}
      deferred = null; emit(); return true;
    },
  };
}

export default function PwaInstall() {
  const { canPrompt, ios, prompt } = useInstall();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(KEY) === '1'); } catch { setDismissed(false); }
    if ('serviceWorker' in navigator) {
      const reg = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
      if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg, { once: true });
    }
    const onBip = e => { e.preventDefault(); deferred = e; emit(); };
    const onInstalled = () => { deferred = null; emit(); };
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);
    const openHint = () => { setDismissed(false); setForceIos(true); };
    window.addEventListener('vac:install-hint', openHint);
    return () => { window.removeEventListener('beforeinstallprompt', onBip); window.removeEventListener('appinstalled', onInstalled); window.removeEventListener('vac:install-hint', openHint); };
  }, []);
  const [forceIos, setForceIos] = useState(false);

  const dismiss = () => { setDismissed(true); setForceIos(false); try { localStorage.setItem(KEY, '1'); } catch {} };
  const iosSafari = ios && typeof navigator !== 'undefined' && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  if (dismissed || !(canPrompt || iosSafari || forceIos)) return null;

  return (
    <div role="dialog" aria-label="Install app"
      className="fixed left-3 right-3 top-[64px] z-30 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-line2 bg-surface/95 p-3 text-sm text-fg shadow-2xl backdrop-blur">
      <img src="/icons/icon-192.png" alt="" width="36" height="36" className="h-9 w-9 shrink-0 rounded-[9px]" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Install Viral AI Clipper</div>
        {canPrompt && !forceIos
          ? <div className="text-xs text-muted">Add it to your home screen for one-tap clipping.</div>
          : <div className="text-xs text-muted">Tap Share <span aria-hidden>⎋</span> → <b>Add to Home Screen</b></div>}
      </div>
      {canPrompt && !forceIos && (
        <button type="button" onClick={async () => { await prompt(); dismiss(); }}
          className="shrink-0 rounded-lg bg-lime px-3 py-1.5 text-xs font-bold text-ink">Install</button>
      )}
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="shrink-0 px-1 text-lg leading-none text-muted hover:text-fg">×</button>
    </div>
  );
}
