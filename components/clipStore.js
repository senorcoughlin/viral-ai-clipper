'use client';

import { readSession } from './AccountBar';

const same = (a, clip) => a && clip && ((clip.id && a.id === clip.id) || (!clip.id && a.title === clip.title && a.startSec === clip.startSec));

// Save an edited clip (new video URL, caption words, hook, brand) so reopening shows it.
// Updates this device's history and, when signed in, the matching clip in the account.
// Never replaces the account list unless it loaded and contains this clip.
export async function persistClipEdit(clip, patch) {
  Object.assign(clip, patch);
  let saved = false;
  try {
    const raw = JSON.parse(localStorage.getItem('viral_clipper_history') || '[]');
    let hit = false;
    for (const h of raw) for (const c of (h.clips || [])) if (same(c, clip)) { Object.assign(c, patch); hit = true; }
    if (hit) { localStorage.setItem('viral_clipper_history', JSON.stringify(raw)); saved = true; }
  } catch {}
  const s = readSession();
  if (s?.email && s?.token) {
    try {
      const post = body => fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: s.email, token: s.token, ...body }) }).then(r => r.json());
      const d = await post({ action: 'load' });
      if (d?.success && Array.isArray(d.clips) && d.clips.some(c => same(c, clip))) {
        const clips = d.clips.map(c => (same(c, clip) ? { ...c, ...patch } : c));
        const w = await post({ action: 'save', clips });
        if (w?.success) saved = true;
      }
    } catch {}
  }
  return saved;
}
