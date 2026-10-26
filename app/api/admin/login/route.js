import { NextResponse } from 'next/server';
import { login, logout, setAdminCookie, clearAdminCookie, requireAdmin, adminDisabled } from '../../../../lib/adminauth';
export const dynamic = 'force-dynamic';
const H = { 'Cache-Control': 'no-store' };
export async function POST(request) {
  const { username, password } = await request.json().catch(() => ({}));
  if (typeof password !== 'string' || password.length > 200) return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: H });
  const r = await login(request, username, password);
  if (!r.ok) return NextResponse.json({ error: r.error, locked: !!r.locked }, { status: r.status, headers: H });
  return setAdminCookie(NextResponse.json({ ok: true }, { headers: H }), r.token);
}
export async function GET(request) { // session check
  const denied = await requireAdmin(request);
  return NextResponse.json({ admin: !denied, disabled: adminDisabled() }, { headers: H });
}
export async function DELETE(request) {
  await logout(request);
  return clearAdminCookie(NextResponse.json({ ok: true }, { headers: H }));
}
