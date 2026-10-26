export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import { kvGetJson, kvSetJson, kvEnabled } from '../../../lib/kv';
import { routeGuard } from '../../../lib/ratelimit';

// One saved Studio project per signed-in account, so clips, edits, campaign
// and publish status follow the user between phone and computer.
const TTL = 60 * 60 * 24 * 90;
const MAX = 400 * 1024;
const keyFor = (email) => `proj:v1:${String(email).toLowerCase()}`;

function who(request) {
  const s = getSession(request);
  return s?.email && s.verified ? s.email : null; // verified sign-ins only
}

export async function GET(request) {
  const email = who(request);
  if (!email) return NextResponse.json({ success: false, signedIn: false });
  const project = kvEnabled ? await kvGetJson(keyFor(email)) : null;
  return NextResponse.json({ success: true, signedIn: true, project: project || null });
}

export async function PUT(request) {
  const limited = await routeGuard(request, 'projects', 240, 3600);
  if (limited) return limited;
  const email = who(request);
  if (!email) return NextResponse.json({ success: false, signedIn: false }, { status: 401 });
  const text = await request.text();
  if (text.length > MAX) return NextResponse.json({ success: false, message: 'Project too large to sync.' }, { status: 413 });
  let body;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ success: false, message: 'Bad JSON' }, { status: 400 }); }
  const project = { ...body, updatedAt: Date.now() };
  const ok = await kvSetJson(keyFor(email), project, TTL);
  return NextResponse.json({ success: ok, updatedAt: project.updatedAt });
}
