export const maxDuration = 120;
import { NextResponse } from 'next/server';
import { readCookie } from '../../../lib/session';
import { refreshAccessToken, COOKIE_OPTS } from '../../../lib/youtube';
import { validateVideoUrl } from '../../../lib/validate';

const TARGETS = {
  youtube: 'https://studio.youtube.com/',
  tiktok: 'https://www.tiktok.com/upload',
  reels: 'https://www.instagram.com/',
  x: 'https://x.com/compose/post',
};
const MAX_BYTES = 256 * 1024 * 1024;

// One-click post prep. When the visitor connected YouTube (httpOnly cookies), the
// clip is uploaded server-side as a private video and the Studio edit link is
// returned so they can review and publish. Otherwise returns the upload page URL.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { platform = 'youtube', caption = '', videoUrl = '', title = 'Clip' } = body;
    if (!videoUrl) return NextResponse.json({ success: false, message: 'Missing video' }, { status: 400 });
    const open = NextResponse.json({ success: true, data: { mode: 'open', url: TARGETS[platform] || TARGETS.youtube, caption } });
    if (platform !== 'youtube') return open;

    let access = readCookie(request, 'yt_access');
    const refresh = readCookie(request, 'yt_refresh');
    let refreshed = null;
    if (!access && refresh) {
      refreshed = await refreshAccessToken(refresh);
      access = refreshed?.access_token || null;
    }
    if (!access) return open;

    const src = validateVideoUrl(videoUrl);
    if (!src || !src.startsWith('https://')) return open;
    const clip = await fetch(src, { cache: 'no-store' });
    const len = Number(clip.headers.get('content-length') || 0);
    if (!clip.ok || len > MAX_BYTES) return open;
    const bytes = Buffer.from(await clip.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return open;

    const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + access,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(bytes.length),
      },
      body: JSON.stringify({
        snippet: { title: String(title).slice(0, 90), description: String(caption).slice(0, 4000), categoryId: '22' },
        status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
      }),
    });
    const uploadUrl = init.headers.get('location');
    if (!init.ok || !uploadUrl) {
      console.warn('youtube init failed', init.status);
      return open;
    }
    const up = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: bytes });
    const video = await up.json().catch(() => ({}));
    if (!up.ok || !video.id) {
      console.warn('youtube upload failed', up.status);
      return open;
    }
    const res = NextResponse.json({ success: true, data: { mode: 'youtube-uploaded', videoId: video.id, url: `https://studio.youtube.com/video/${video.id}/edit`, caption } });
    if (refreshed?.access_token) res.cookies.set('yt_access', refreshed.access_token, { ...COOKIE_OPTS, maxAge: Math.max(60, Number(refreshed.expires_in || 3600) - 60) });
    return res;
  } catch (e) {
    console.error('post failed', e?.message);
    return NextResponse.json({ success: false, message: 'Post failed' }, { status: 500 });
  }
}
