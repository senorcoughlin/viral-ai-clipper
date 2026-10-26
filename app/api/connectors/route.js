export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { CONNECTORS } from '../../../lib/connectors';
import { readCookie } from '../../../lib/session';

export async function GET(request) {
  const youtube = !!(readCookie(request, 'yt_refresh') || readCookie(request, 'yt_access'));
  return NextResponse.json({ success: true, connectors: CONNECTORS, account: { youtube } });
}
