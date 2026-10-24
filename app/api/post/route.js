import { NextResponse } from 'next/server';

// One-click post prep. Downloads are client-side; this returns the best upload URL
// and, when YouTube is connected, uploads the clip directly.
export async function POST(request) {
  try {
    const body = await request.json();
    const { platform = 'youtube', caption = '', videoUrl = '', title = 'Clip' } = body;
    if (!videoUrl) return NextResponse.json({ success: false, message: 'Missing video' }, { status: 400 });

    const targets = {
      youtube: 'https://studio.youtube.com/',
      tiktok: 'https://www.tiktok.com/upload',
      reels: 'https://www.instagram.com/',
      x: 'https://x.com/compose/post',
    };

    // Direct YouTube upload when the user has connected a channel.
    const token = process.env.YOUTUBE_ACCESS_TOKEN;
    if (platform === 'youtube' && token) {
      const meta = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/mp4',
        },
        body: JSON.stringify({
          snippet: { title: title.slice(0, 90), description: caption.slice(0, 400), categoryId: '22' },
          status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
        }),
      });
      const uploadUrl = meta.headers.get('location');
      if (uploadUrl) {
        return NextResponse.json({ success: true, data: { mode: 'youtube-direct', uploadUrl, caption } });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        mode: 'open',
        url: targets[platform] || targets.youtube,
        caption,
        videoUrl,
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, message: e.message || 'Post failed' }, { status: 500 });
  }
}
