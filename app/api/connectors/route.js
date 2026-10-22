export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { CONNECTORS } from '../../../lib/connectors';

export async function GET() {
  return NextResponse.json({ success: true, connectors: CONNECTORS });
}

export async function POST(request) {
  const { id, action } = await request.json().catch(() => ({}));
  const connector = CONNECTORS.find(c => c.id === id);
  if (!connector) return NextResponse.json({ success: false, message: 'Unknown connector' }, { status: 404 });
  if (connector.status === 'coming') {
    return NextResponse.json({ success: false, message: `${connector.name} is ready to plug in. Add an API key in Vercel to activate it.` }, { status: 400 });
  }
  return NextResponse.json({ success: true, connector, action: action || 'status' });
}
