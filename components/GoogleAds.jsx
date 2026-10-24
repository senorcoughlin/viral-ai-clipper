'use client';
import Script from 'next/script';
import { useEffect, useState } from 'react';
import { GADS_ID } from '../lib/conversions';

const ATTR_KEYS = ['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const COOKIE = 'vac_attr';

// Saves ad click IDs / UTM params from the landing URL into a first-party cookie for 90 days,
// so /api/checkout can attach them to the Stripe session metadata.
function captureAttribution() {
  try {
    const q = new URLSearchParams(window.location.search);
    const found = {};
    for (const k of ATTR_KEYS) { const v = q.get(k); if (v) found[k] = v.slice(0, 200); }
    if (!Object.keys(found).length) return;
    found.landing = window.location.pathname.slice(0, 100);
    found.ts = Date.now();
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(found))}; Max-Age=${90 * 86400}; Path=/; SameSite=Lax${secure}`;
  } catch {}
}

function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => { try { setShow(!localStorage.getItem('vac_cookie_ok')); } catch {} }, []);
  if (!show) return null;
  const close = () => { try { localStorage.setItem('vac_cookie_ok', '1'); } catch {} setShow(false); };
  return (
    <div role="region" aria-label="Cookie notice"
      className="fixed left-3 right-3 z-30 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-line2 bg-surface/95 px-3 py-2 text-xs text-soft shadow-2xl backdrop-blur bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-4 md:left-4 md:right-auto md:mx-0 md:max-w-sm">
      <p className="min-w-0 flex-1">We use cookies for sign-in, analytics and ad measurement. <a href="/privacy" className="text-fg underline">Privacy</a></p>
      <button type="button" onClick={close} className="shrink-0 rounded-lg bg-lime px-3 py-1.5 font-semibold text-ink">OK</button>
    </div>
  );
}

export default function GoogleAds() {
  useEffect(() => { captureAttribution(); }, []);
  return (
    <>
      {GADS_ID && /^AW-\d+$/.test(GADS_ID) && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GADS_ID}`} strategy="afterInteractive" />
          <Script id="gads-init" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GADS_ID}');`}</Script>
        </>
      )}
      <CookieNotice />
    </>
  );
}
