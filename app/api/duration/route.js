export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { routeGuard } from '../../../lib/ratelimit';
import { validateVideoUrl } from '../../../lib/validate';
import { youtubeInfoDuration } from '../../../lib/downloader';
import { probeRemoteDuration, localFfmpegAvailable } from '../../../lib/localprep';
import { toFetchable } from '../../../lib/media';
import { youtubeDuration } from '../../../lib/ytduration';
import { youtubeIdOf } from '../../../lib/links';
import { parseStreamUrl } from '../../../lib/stream';

// Best-effort source length (seconds) so the generate screen can offer "Use whole video".
// Returns { secs: 0 } when it can't tell; the generate route re-checks on the server.

export async function GET(request) {
  const limited = await routeGuard(request, 'duration', 60, 600);
  if (limited) return limited;
  const raw = new URL(request.url).searchParams.get('url') || '';
  const url = validateVideoUrl(raw);
  const h = { 'Cache-Control': 'no-store' };
  if (!url) return NextResponse.json({ secs: 0 }, { headers: h });
  let secs = 0;
  try {
    const id = youtubeIdOf(url);
    if (id) {
      const page = await youtubeDuration(id);
      secs = page > 0 ? page : (Number(await youtubeInfoDuration(url, 7000)) || 0);
    }
    else if (!parseStreamUrl(url) && localFfmpegAvailable()) secs = await probeRemoteDuration(toFetchable(url), null, null, 10000);
  } catch {}
  return NextResponse.json({ secs: secs > 0 ? Math.round(secs * 10) / 10 : 0 }, { headers: h });
}
