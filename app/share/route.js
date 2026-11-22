import { NextResponse } from 'next/server';

// Fallback for the PWA share target if the service worker didn't intercept the POST
// (installed PWAs normally handle this in sw.js so large video files never hit the server).
function target(request, form) {
  const url = String(form?.get?.('url') || '');
  const text = String(form?.get?.('text') || '');
  const found = url || (text.match(/https?:\/\/\S+/i) || [])[0] || new URL(request.url).searchParams.get('url') || '';
  const q = new URLSearchParams();
  if (found) q.set('url', found);
  return NextResponse.redirect(new URL('/' + (q.toString() ? '?' + q.toString() : ''), request.url), 303);
}

export async function GET(request) {
  return target(request, null);
}

export async function POST(request) {
  const form = await request.formData().catch(() => null);
  return target(request, form);
}
