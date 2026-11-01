export const maxDuration = 120;
import { NextResponse } from 'next/server';
import { routeGuard } from '../../../lib/ratelimit';

const TARGETS = {
  youtube: 'https://www.youtube.com/upload',
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

// Post prep: returns the platform's upload page URL (no server-side uploads).
export async function POST(request) {
  const limited = await routeGuard(request, 'post', 60, 3600);
  if (limited) return limited;
  try {
    const body = await request.json().catch(() => ({}));
    const { platform = 'youtube', caption = '', videoUrl = '', title = 'Clip', schedule = false, bestTime = '', tz = 'America/New_York' } = body;
    const publishAt = schedule ? nextBestTime(bestTime, tz) : null;
    if (schedule && !publishAt) return NextResponse.json({ success: false, message: 'Could not read the best time for this clip.' }, { status: 400 });
    if (!videoUrl) return NextResponse.json({ success: false, message: 'Missing video' }, { status: 400 });
    const openWith = (why) => NextResponse.json({ success: true, data: { mode: 'open', url: TARGETS[platform] || TARGETS.youtube, caption, why } });
    const open = openWith(null);
    if (platform !== 'youtube') return open;

    // YouTube auto-upload was removed: every platform just opens its upload page.
    return open;
  } catch (e) {
    console.error('post failed', e?.message);
    return NextResponse.json({ success: false, message: 'Post failed' }, { status: 500 });
  }
}
