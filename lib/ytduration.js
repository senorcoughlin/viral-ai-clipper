// Best-effort YouTube duration lookup (seconds) from the public watch page.
export async function youtubeDuration(id) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}&hl=en`, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'Mozilla/5.0' },
      signal: ctrl.signal, cache: 'no-store',
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const html = await r.text();
    // Only a hard ERROR means the video is gone; LOGIN_REQUIRED is often YouTube bot-checking our server IP.
    if (/"playabilityStatus":\{"status":"ERROR"/.test(html) && !/"lengthSeconds"/.test(html)) return 0;
    if (/"isLive":true/.test(html) || /"isLiveNow":true/.test(html)) return -1; // currently live
    if (/"isUpcoming":true/.test(html)) return -2; // scheduled premiere / stream not started
    const m = html.match(/"lengthSeconds":"(\d+)"/);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}
