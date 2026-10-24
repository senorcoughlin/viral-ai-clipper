export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

function channelIdFrom(input) {
  const raw = String(input || '').trim();
  if (/^UC[\w-]{20,}$/.test(raw)) return raw;
  const m = raw.match(/channel\/(UC[\w-]{20,})/);
  return m ? m[1] : null;
}

// Turn @handles, /c/, /user/ and share links (with ?si=) into a channel page URL.
function channelPageFrom(input) {
  let raw = String(input || '').trim();
  const found = raw.match(/https?:\/\/\S+/);
  if (found) raw = found[0];
  if (/^@[\w.-]+$/.test(raw)) return `https://www.youtube.com/${raw}`;
  try {
    const u = new URL(/^https?:/.test(raw) ? raw : `https://${raw}`);
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
    const seg = u.pathname.split('/').filter(Boolean);
    if (seg[0]?.startsWith('@')) return `https://www.youtube.com/${seg[0]}`;
    if ((seg[0] === 'c' || seg[0] === 'user') && seg[1]) return `https://www.youtube.com/${seg[0]}/${seg[1]}`;
  } catch {}
  return null;
}

async function resolveChannelId(input) {
  const direct = channelIdFrom(input);
  if (direct) return direct;
  const page = channelPageFrom(input);
  if (!page) return null;
  const res = await fetch(page, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1' } });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/"externalId":"(UC[\w-]{20,})"/) || html.match(/channel_id=(UC[\w-]{20,})/) || html.match(/"channelId":"(UC[\w-]{20,})"/);
  return m ? m[1] : null;
}

const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export async function POST(request) {
  const { channel } = await request.json().catch(() => ({}));
  const id = await resolveChannelId(channel).catch(() => null);
  if (!id) {
    return NextResponse.json({ success: false, message: 'Could not find that channel. Paste a link like youtube.com/@name' }, { status: 400 });
  }
  try {
    let videos = [];
    const feed = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`).catch(() => null);
    if (feed?.ok) {
      const xml = await feed.text();
      videos = [...xml.matchAll(/<entry>[\s\S]*?<yt:videoId>([^<]+)<\/yt:videoId>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<\/entry>/g)]
        .slice(0, 5).map(m => ({ id: m[1], title: decode(m[2]), url: `https://www.youtube.com/watch?v=${m[1]}` }));
    }
    if (!videos.length) {
      // RSS is often down; fall back to the channel's Videos tab.
      const page = await fetch(`https://www.youtube.com/channel/${id}/videos`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1' } });
      const html = page.ok ? await page.text() : '';
      const ids = [...new Set([...html.matchAll(/"url":"\/watch\?v=([\w-]{11})"/g)].map(m => m[1]))].slice(0, 5);
      videos = await Promise.all(ids.map(async vid => {
        const url = `https://www.youtube.com/watch?v=${vid}`;
        const o = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
        return { id: vid, title: o?.title || 'Untitled video', url };
      }));
    }
    if (!videos.length) return NextResponse.json({ success: false, message: 'Could not read that channel' }, { status: 400 });
    return NextResponse.json({ success: true, channelId: id, videos });
  } catch (e) {
    return NextResponse.json({ success: false, message: e?.message || 'Channel lookup failed' }, { status: 500 });
  }
}
