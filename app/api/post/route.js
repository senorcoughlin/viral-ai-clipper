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
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Offset (ms) of a time zone at a given instant.
function tzOffset(tz, date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime();
}

// "Tue 7pm" -> next such moment (at least 30 min out) in the viewer's time zone, as a Date.
function nextBestTime(bestTime, tz) {
  const m = String(bestTime || '').toLowerCase().match(/(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = 'America/New_York'; }
  let hour = Number(m[2]) % 12 + (m[4] === 'pm' ? 12 : 0);
  if (!m[4] && Number(m[2]) >= 12) hour = Number(m[2]);
  const min = Number(m[3] || 0);
  const now = new Date();
  const localNow = new Date(now.getTime() + tzOffset(tz, now)); // wall clock as UTC fields
  for (let add = 0; add <= 7; add++) {
    const d = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + add, hour, min));
    if (d.getUTCDay() !== DAYS.indexOf(m[1])) continue;
    const utc = new Date(d.getTime() - tzOffset(tz, d));
    if (utc.getTime() > now.getTime() + 30 * 60000) return utc;
  }
  return null;
}

// One-click post prep. When the visitor connected YouTube (httpOnly cookies), the
// clip is uploaded server-side as a private video and the Studio edit link is
// returned so they can review and publish. Otherwise returns the upload page URL.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { platform = 'youtube', caption = '', videoUrl = '', title = 'Clip', schedule = false, bestTime = '', tz = 'America/New_York' } = body;
    const publishAt = schedule ? nextBestTime(bestTime, tz) : null;
    if (schedule && !publishAt) return NextResponse.json({ success: false, message: 'Could not read the best time for this clip.' }, { status: 400 });
    if (!videoUrl) return NextResponse.json({ success: false, message: 'Missing video' }, { status: 400 });
    const openWith = (why) => NextResponse.json({ success: true, data: { mode: 'open', url: TARGETS[platform] || TARGETS.youtube, caption, why } });
    const open = openWith(null);
    if (platform !== 'youtube') return open;

    let access = readCookie(request, 'yt_access');
    const refresh = readCookie(request, 'yt_refresh');
    let refreshed = null;
    if (!access && refresh) {
      refreshed = await refreshAccessToken(refresh);
      access = refreshed?.access_token || null;
    }
    if (!access) return openWith('not_connected');

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
        status: { privacyStatus: 'private', selfDeclaredMadeForKids: false, ...(publishAt ? { publishAt: publishAt.toISOString() } : {}) },
      }),
    });
    const uploadUrl = init.headers.get('location');
    if (!init.ok || !uploadUrl) {
      console.warn('youtube init failed', init.status);
      // 401/403: token expired, app still in Google "testing" without this user, or scope missing.
      return openWith(init.status === 401 || init.status === 403 ? 'not_authorized' : 'upload_failed');
    }
    const up = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: bytes });
    const video = await up.json().catch(() => ({}));
    if (!up.ok || !video.id) {
      console.warn('youtube upload failed', up.status);
      return openWith('upload_failed');
    }
    const res = NextResponse.json({ success: true, data: { mode: publishAt ? 'youtube-scheduled' : 'youtube-uploaded', videoId: video.id, publishAt: publishAt?.toISOString() || null, url: `https://studio.youtube.com/video/${video.id}/edit`, caption } });
    if (refreshed?.access_token) res.cookies.set('yt_access', refreshed.access_token, { ...COOKIE_OPTS, maxAge: Math.max(60, Number(refreshed.expires_in || 3600) - 60) });
    return res;
  } catch (e) {
    console.error('post failed', e?.message);
    return NextResponse.json({ success: false, message: 'Post failed' }, { status: 500 });
  }
}
