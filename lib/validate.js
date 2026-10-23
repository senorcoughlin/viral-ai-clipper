// Accepts public http(s) video links (YouTube and other yt-dlp-supported sites).
// Rejects malformed URLs, non-http schemes, localhost and private/IP-literal hosts
// so we don't spend RenderIO/Gemini calls on junk or internal addresses.
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?f[cd][0-9a-f]{2}:)/i;

export function validateVideoUrl(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > 2048) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || PRIVATE_HOST.test(host)) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')) return null;
  const bare = host.replace(/^(www|m|music)\./, '');
  if (bare === 'youtube.com') {
    if (!u.searchParams.get('v') && !/^\/(shorts|embed|live)\/[\w-]{6,}/.test(u.pathname)) return null;
  }
  if (bare === 'youtu.be' && !/^\/[\w-]{6,}/.test(u.pathname)) return null;
  return u.toString();
}
