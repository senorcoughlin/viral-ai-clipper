import { NextResponse } from 'next/server';

// YouTube auto-upload was removed (Nov 2026). Users download clips and post them themselves.
export async function GET() {
  return NextResponse.json({ success: false, message: 'YouTube upload has been removed. Download your clip and post it yourself.' }, { status: 410 });
}
