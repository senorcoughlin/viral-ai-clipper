export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

function channelIdFrom(input) {
  const raw = String(input || '').trim();
  if (/^UC[\w-]{20,}$/.test(raw)) return raw;
  const m = raw.match(/channel\/(UC[\w-]{20,})/);
  return m ? m[1] : null;
}

export async function POST(request) {
  const { channel } = await request.json().catch(() => ({}));
  const id = channelIdFrom(channel);
  if (!id) {
    return NextResponse.json({ success: false, message: 'Paste a channel URL like youtube.com/channel/UC...' }, { status: 400 });
  }
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
    if (!res.ok) return NextResponse.json({ success: false, message: 'Could not read that channel' }, { status: 400 });
    const xml = await res.text();
    const videos = [...xml.matchAll(/<entry>[\s\S]*?<yt:videoId>([^<]+)<\/yt:videoId>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<\/entry>/g)]
      .slice(0, 5)
      .map(m => ({ id: m[1], title: m[2], url: `https://www.youtube.com/watch?v=${m[1]}` }));
    return NextResponse.json({ success: true, channelId: id, videos });
  } catch (e) {
    return NextResponse.json({ success: false, message: e?.message || 'Channel lookup failed' }, { status: 500 });
  }
}
