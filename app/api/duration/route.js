export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { routeGuard } from '../../../lib/ratelimit';
import { validateVideoUrl } from '../../../lib/validate';
import { ytSourceMaxSec } from '../../../lib/downloader';
import { resolveYoutubeSecs } from '../../../lib/ytinfo';
import { probeRemoteDuration, localFfmpegAvailable } from '../../../lib/localprep';
import { toRenderUrl } from '../../../lib/media';
import { youtubeIdOf } from '../../../lib/links';
import { parseStreamUrl } from '../../../lib/stream';
import { FREE_PROCESS_SEC, ytPaidWindowSec } from '../../../lib/pipeline';

// Best-effort source length (seconds) so the generate screen can offer "Use whole video".
// Returns { secs: 0 } when it can't tell; the generate route re-checks on the server.

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  // ?limits=1 -> the length caps, so the form can show them before anything is pasted. CDN-cached.
  if (sp.get('limits')) {
    const srcMax = Number(process.env.MAX_SOURCE_MINUTES || 120) * 60;
    return NextResponse.json({ maxSecs: Math.max(srcMax, FREE_PROCESS_SEC), ytMaxSecs: FREE_PROCESS_SEC, ytMaxSecsPaid: ytPaidWindowSec(ytSourceMaxSec()), hardMaxSecs: ytSourceMaxSec(), liveClipable: true }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
  }
  const limited = await routeGuard(request, 'duration', 60, 600);
  if (limited) return limited;
  const raw = new URL(request.url).searchParams.get('url') || '';
  const url = validateVideoUrl(raw);
  const h = { 'Cache-Control': 'no-store' };
  if (!url) return NextResponse.json({ secs: 0 }, { headers: h });
  let secs = 0;
  let live = false;
  let upcoming = false;
  const id = youtubeIdOf(url);
  // Same caps the generate route enforces, so the form can warn before a run is wasted.
  const srcMax = Number(process.env.MAX_SOURCE_MINUTES || 120) * 60;
  const maxSecs = id ? FREE_PROCESS_SEC : srcMax;
  try {
    if (id) {
      const got = await resolveYoutubeSecs(id, url);
      if (got === -1) live = true;
      else if (got === -2) upcoming = true;
      else secs = got > 0 ? got : 0;
    }
    else if (!parseStreamUrl(url) && localFfmpegAvailable()) secs = await probeRemoteDuration(await toRenderUrl(url, 10 * 60), null, null, 10000);
  } catch {}
  return NextResponse.json({ secs: secs > 0 ? Math.round(secs * 10) / 10 : 0, live, upcoming, maxSecs, ytMaxSecs: FREE_PROCESS_SEC, ytMaxSecsPaid: ytPaidWindowSec(ytSourceMaxSec()), hardMaxSecs: id ? ytSourceMaxSec() : 0, liveClipable: !!live }, { headers: h });
}
