'use client';
import { useEffect } from 'react';
// Remembers ?ref=<code> for 30 days so the bonus applies when the visitor signs up later.
export default function ReferralCapture() {
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const ref = (q.get('ref') || '').toLowerCase();
      if (!/^[a-z0-9]{6,10}$/.test(ref)) return;
      if (!document.cookie.split('; ').some(c => c.startsWith('vac_ref='))) {
        document.cookie = `vac_ref=${ref}; Path=/; Max-Age=${30 * 86400}; SameSite=Lax; Secure`;
      }
      q.delete('ref');
      const qs = q.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
    } catch {}
  }, []);
  return null;
}
