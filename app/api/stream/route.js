export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { probeStream } from '../../../lib/stream';
import { routeGuard } from '../../../lib/ratelimit';

// GET /api/stream?url=… -> { kind, live, archive, name } so the UI can show the
// "clip the last X minutes" picker only for channels that are live right now.
export async function GET(request) {
  const limited = await routeGuard(request, 'stream-probe', 120, 3600);
  if (limited) return limited;
  const url = new URL(request.url).searchParams.get('url') || '';
  try {
    return NextResponse.json({ success: true, data: await probeStream(url.slice(0, 500)) });
  } catch (e) {
    return NextResponse.json({ success: false, message: e?.userFacing ? e.message : 'Could not check that stream.' }, { status: 200 });
  }
}
