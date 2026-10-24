export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { kvGetJson, kvSetJson } from '../../../lib/kv';

// Source video's creator via YouTube oEmbed: { author, authorUrl }.
export async function GET(request) {
  const url = new URL(request.url).searchParams.get('url') || '';
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (!m) return NextResponse.json({ success: false, message: 'Not a YouTube video link' }, { status: 400 });
  const ck = 'credit:' + m[1];
  const cached = await kvGetJson(ck);
  if (cached) return NextResponse.json({ success: true, ...cached });
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + m[1])}`, { cache: 'no-store' });
    if (!r.ok) return NextResponse.json({ success: false, message: 'Creator not found' }, { status: 404 });
    const d = await r.json();
    const data = { author: String(d.author_name || '').slice(0, 80), authorUrl: String(d.author_url || '').slice(0, 200) };
    if (data.author) await kvSetJson(ck, data, 7 * 86400);
    return NextResponse.json({ success: !!data.author, ...data });
  } catch {
    return NextResponse.json({ success: false, message: 'Lookup failed' }, { status: 502 });
  }
}
