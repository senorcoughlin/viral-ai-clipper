// City stats for a date range (America/New_York days).
// Auth: header `x-stats-key: $STATS_ADMIN_KEY`, or a signed-in guest admin session.
// GET /api/admin/cities?from=YYYY-MM-DD&to=YYYY-MM-DD   (defaults: last 7 days)
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminauth';
import { cityStats } from '../../../../lib/geo';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
function keyOk(got, want) {
  if (!want || !got) return false;
  const a = crypto.createHash('sha256').update(String(got)).digest();
  const b = crypto.createHash('sha256').update(String(want)).digest();
  return crypto.timingSafeEqual(a, b);
}
const nyDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  if (!keyOk(request.headers.get('x-stats-key'), process.env.STATS_ADMIN_KEY)) {
    const denied = await requireAdmin(request);
    if (denied) return denied;
  }
  const u = new URL(request.url);
  const to = DAY_RE.test(u.searchParams.get('to') || '') ? u.searchParams.get('to') : nyDay();
  const from = DAY_RE.test(u.searchParams.get('from') || '') ? u.searchParams.get('from') : nyDay(new Date(Date.parse(to + 'T12:00:00Z') - 6 * 86400000));
  if (from > to) return NextResponse.json({ error: 'from must be on or before to' }, { status: 400, headers: noStore });
  try { return NextResponse.json(await cityStats(from, to), { headers: noStore }); }
  catch (e) { return NextResponse.json({ error: 'Could not load: ' + String(e?.message || e).slice(0, 120) }, { status: 500, headers: noStore }); }
}
