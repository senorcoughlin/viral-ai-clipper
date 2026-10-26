'use client';

import { useEffect } from 'react';

const MINE = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';

// If the site was updated while this tab stayed open (or Chrome restored an old tab),
// reload once so the phone runs the newest code. Skips while the clip editor is open.
export default function VersionCheck() {
  useEffect(() => {
    if (MINE === 'dev') return;
    let stop = false;
    const check = async () => {
      if (stop || document.visibilityState !== 'visible') return;
      try {
        const d = await (await fetch('/api/version', { cache: 'no-store' })).json();
        if (!d?.build || d.build === 'dev' || d.build === MINE) return;
        const key = 'vac_reloaded_for';
        if (sessionStorage.getItem(key) === d.build) return; // at most once per build
        if (document.querySelector('[data-testid=clip-editor]')) return;
        sessionStorage.setItem(key, d.build);
        navigator.serviceWorker?.getRegistration?.().then(r => r?.update?.()).catch(() => {});
        location.reload();
      } catch {}
    };
    check();
    const onVis = () => check();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onVis);
    const t = setInterval(check, 5 * 60 * 1000);
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pageshow', onVis); };
  }, []);
  return null;
}
