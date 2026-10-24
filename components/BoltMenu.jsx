'use client';
import { useEffect, useRef, useState } from 'react';
import { useInstall } from './PwaInstall';
import AccountBar from './AccountBar';

const LINKS = [
  ['Home', '/#top'], ['Generations remaining', '/#remaining'], ['Your clips', '/#clips'], ['Tutorial', '/tutorial'],
  ['Connect YouTube', '/api/youtube/start'], ['Connectors', '/connectors'],
  ['AI Tools', '/tools'], ['My Assets', '/assets'], ['Channel', '/channel'], ['Monetize', '/monetize'], ['Permissions', '/permissions'], ['Clipping programs', '/programs'], ['Pricing', '/#pricing'],
];

export default function BoltMenu({ icon, onAccountChange }) {
  const [open, setOpen] = useState(false);
  const install = useInstall();
  const ref = useRef(null);
  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, []);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="grid h-9 w-9 place-items-center rounded-[10px] bg-lime transition hover:brightness-110">{icon}</button>
      {open && (
        <div className="absolute left-0 top-12 z-50 w-64 max-w-[calc(100vw-2rem)] max-h-[80vh] overflow-y-auto overflow-x-hidden rounded-xl border border-line2 bg-surface p-2 shadow-2xl">
          <div className="border-b border-line/60 px-3 pb-3 pt-2 text-sm">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Account</div>
            <AccountBar inline onChange={onAccountChange} />
          </div>
          <nav className="flex flex-col py-1">
            {LINKS.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-soft no-underline hover:bg-ink hover:text-fg">{label}</a>
            ))}
            {!install.standalone && (
              <button type="button" onClick={async () => { setOpen(false); if (!(await install.prompt())) window.dispatchEvent(new Event('vac:install-hint')); }}
                className="rounded-lg px-3 py-2 text-left text-sm font-medium text-lime hover:bg-ink">Install app</button>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
