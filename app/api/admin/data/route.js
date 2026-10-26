import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminauth';
import { viewUsers, viewStats, viewErrors, viewSite, viewAudit } from '../../../../lib/adminviews';
export const dynamic = 'force-dynamic';
const VIEWS = { users: (u) => viewUsers(u.searchParams.get('q') || ''), stats: viewStats, errors: viewErrors, site: viewSite, audit: viewAudit };
export async function GET(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const u = new URL(request.url);
  const v = VIEWS[u.searchParams.get('view')];
  if (!v) return NextResponse.json({ error: 'unknown view' }, { status: 400 });
  try { return NextResponse.json(await v(u), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return NextResponse.json({ error: 'Could not load: ' + String(e?.message || e).slice(0, 120) }, { status: 500 }); }
}
