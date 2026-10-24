export const maxDuration = 120;
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { renderioCut, sanitizeBrand } from '../../../lib/render';
import { validateVideoUrl } from '../../../lib/validate';
import { toFetchable } from '../../../lib/media';
import { allowAttempt, clientIp } from '../../../lib/ratelimit';

const SAFE_CROP = /^scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280:x=\(iw-720\)\*[01]\.\d{3}:y=\(ih-1280\)(\/5|\*[01]\.\d{3})$/;

// Re-render one clip with edited caption words and/or a brand kit.
// Body: { source, startSec, endSec, format, style, words:[{w,a,b}], brand, crop }
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const rio = process.env.RENDERIO_API_KEY;
  if (!rio) return NextResponse.json({ success: false, message: 'Rendering is not configured' }, { status: 500 });
  const source = validateVideoUrl(body.source);
  const start = Math.max(0, Number(body.startSec) || 0);
  const len = Math.min(90, Math.max(3, (Number(body.endSec) || start + 30) - start));
  if (!source) return NextResponse.json({ success: false, message: 'Missing source video' }, { status: 400 });
  if (!(await allowAttempt(`rerender:${clientIp(request)}`, 30, 24 * 3600))) {
    return NextResponse.json({ success: false, message: 'Re-render limit reached for today.' }, { status: 429 });
  }
  const words = (Array.isArray(body.words) ? body.words : []).slice(0, 300)
    .map(x => ({ w: String(x?.w || '').slice(0, 40), a: Number(x?.a), b: Number(x?.b) }))
    .filter(x => x.w.trim() && Number.isFinite(x.a) && Number.isFinite(x.b) && x.a >= 0 && x.b >= x.a && x.a <= len);
  const vertical = (body.format || 'shorts_9_16') === 'shorts_9_16';
  const crop = typeof body.crop === 'string' && SAFE_CROP.test(body.crop) ? body.crop : null;
  try {
    const url = await renderioCut(toFetchable(source), start, len, rio, words.length ? '' : String(body.caption || '').slice(0, 80), vertical, {
      wordCaptions: true, timedWords: words, broll: false, style: body.style, crop, brand: sanitizeBrand(body.brand),
    });
    return NextResponse.json({ success: true, videoUrl: url });
  } catch (e) {
    console.warn('rerender failed', e?.message);
    if (e?.capacity) return NextResponse.json({ success: false, message: e.message }, { status: 503 });
    return NextResponse.json({ success: false, message: 'Re-render failed. Try again.' }, { status: 502 });
  }
}
