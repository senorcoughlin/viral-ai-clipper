export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

// Current deployed build, so open tabs running an old bundle can reload themselves.
export async function GET() {
  return NextResponse.json({ build: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'dev' }, { headers: { 'Cache-Control': 'no-store' } });
}
