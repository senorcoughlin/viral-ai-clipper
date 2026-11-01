export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { CONNECTORS } from '../../../lib/connectors';

export async function GET() {
  return NextResponse.json({ success: true, connectors: CONNECTORS, account: {} });
}
