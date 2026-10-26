import { NextResponse } from 'next/server';
import { getSiteConfig } from '../../../lib/siteconfig';
export const dynamic = 'force-dynamic';
// Public, non-secret: banner text + feature flags for the UI.
export async function GET() {
  return NextResponse.json(await getSiteConfig(), { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=20, stale-while-revalidate=60' } });
}
