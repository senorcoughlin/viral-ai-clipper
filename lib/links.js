// Shared (client + server) parsing of the "Video links" box.
// People paste links back to back with no separator (e.g. copied from a share
// sheet), so split on every http(s):// occurrence, not just whitespace/commas.
export const MAX_LINKS = 10;

// YouTube video id from any common URL shape (watch, youtu.be, shorts, embed, live).
export function youtubeIdOf(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') { const m = u.pathname.match(/^\/([\w-]{11})/); return m ? m[1] : null; }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = u.searchParams.get('v');
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

// Canonical form used for dedupe and processing: YouTube links become
// https://www.youtube.com/watch?v=<id> (drops share-tracking params like ?si=).
export function canonicalLink(url) {
  const id = youtubeIdOf(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : url;
}

export function splitLinks(text) {
  const s = String(text || '');
  const parts = s.split(/(?=https?:\/\/)/i);
  const out = [];
  for (const p of parts) {
    for (const piece of p.split(/[\s,;]+/)) {
      const t = piece.trim().replace(/[)\]>"'.]+$/, '');
      if (/^https?:\/\/\S+/i.test(t)) out.push(t);
    }
  }
  return out;
}

// -> { links: string[] (canonical, deduped, capped), found, duplicates, dropped }
export function parseLinks(text, max = MAX_LINKS) {
  const raw = splitLinks(text);
  const seen = new Set();
  const uniq = [];
  for (const r of raw) {
    const c = canonicalLink(r);
    const key = (youtubeIdOf(c) || c).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(c);
  }
  return { links: uniq.slice(0, max), found: raw.length, duplicates: raw.length - uniq.length, dropped: Math.max(0, uniq.length - max) };
}
