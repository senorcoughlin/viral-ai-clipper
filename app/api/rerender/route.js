export const maxDuration = 300;
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { head, put } from '@vercel/blob';
import { renderioCut, sanitizeBrand } from '../../../lib/render';
import { validateVideoUrl } from '../../../lib/validate';
import { toFetchable, isBlobUrl } from '../../../lib/media';
import { allowAttempt, clientIp } from '../../../lib/ratelimit';
import { routeGuard } from '../../../lib/ratelimit';
import { paidEmail } from '../../../lib/session';
import { getEntitlement } from '../../../lib/billing';
import { kvGetJson } from '../../../lib/kv';
import { youtubeIdOf } from '../../../lib/links';

const SAFE_CROP = /^scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280:x=\(iw-720\)\*[01]\.\d{3}:y=\(ih-1280\)(\/5|\*[01]\.\d{3})$/;

// Re-render one clip with edited caption words and/or a brand kit.
// Body: { source, startSec, endSec, format, style, words:[{w,a,b}], brand, crop }
export async function POST(request) {
  const limited = await routeGuard(request, 'rerender', 120, 3600);
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const rio = process.env.RENDERIO_API_KEY;
  if (!rio) return NextResponse.json({ success: false, message: 'Rendering is not configured' }, { status: 500 });
  const source = validateVideoUrl(body.source);
  const start = Math.max(0, Number(body.startSec) || 0);
  const len = Math.min(900, Math.max(3, (Number(body.endSec) || start + 30) - start));
  if (!source) return NextResponse.json({ success: false, message: 'Missing source video' }, { status: 400 });
  if (!(await allowAttempt(`rerender:${clientIp(request)}`, 30, 24 * 3600))) {
    return NextResponse.json({ success: false, message: 'Re-render limit reached for today.' }, { status: 429 });
  }
  // Studio crop box: fractions of the frame, validated to a sane rectangle.
  let userCrop = null;
  const uc = body.userCrop;
  if (uc && typeof uc === 'object') {
    const v = ['x', 'y', 'w', 'h'].map(k => Number(uc[k]));
    if (v.every(Number.isFinite) && v[2] >= 0.1 && v[3] >= 0.1 && v[0] >= 0 && v[1] >= 0 && v[0] + v[2] <= 1.001 && v[1] + v[3] <= 1.001
      && !(v[0] < 0.002 && v[1] < 0.002 && v[2] > 0.998 && v[3] > 0.998)) userCrop = { x: v[0], y: v[1], w: Math.min(v[2], 1 - v[0]), h: Math.min(v[3], 1 - v[1]) };
  }
  // Transcript cuts: clip-relative [a,b] ranges to remove. Merge, then keep the rest.
  const cuts = (Array.isArray(body.cuts) ? body.cuts : []).slice(0, 200)
    .map(c => [Math.max(0, Number(c?.[0])), Math.min(len, Number(c?.[1]))])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b - a >= 0.05)
    .sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const c of cuts) { const l = merged[merged.length - 1]; if (l && c[0] <= l[1] + 0.05) l[1] = Math.max(l[1], c[1]); else merged.push([...c]); }
  let keep = null; let outLen = len;
  if (merged.length) {
    keep = []; let t = 0;
    for (const [a, b] of merged) { if (a - t >= 0.1) keep.push([t, a]); t = b; }
    if (len - t >= 0.1) keep.push([t, len]);
    outLen = keep.reduce((s, [a, b]) => s + b - a, 0);
    if (outLen < 1) return NextResponse.json({ success: false, message: 'You cut almost the whole clip. Keep at least a second of it.' }, { status: 400 });
    if (keep.length > 60) return NextResponse.json({ success: false, message: 'Too many separate cuts (max 60). Merge some nearby cuts and try again.' }, { status: 400 });
  }
  const words = (Array.isArray(body.words) ? body.words : []).slice(0, 1500)
    .map(x => ({ w: String(x?.w || '').slice(0, 40), a: Number(x?.a), b: Number(x?.b) }))
    .filter(x => x.w.trim() && Number.isFinite(x.a) && Number.isFinite(x.b) && x.a >= 0 && x.b >= x.a && x.a <= outLen);
  const vertical = (body.format || 'shorts_9_16') === 'shorts_9_16';
  const crop = typeof body.crop === 'string' && SAFE_CROP.test(body.crop) ? body.crop : null;
  const hook = String(body.hook || '').slice(0, 60);
  // Facecam/reaction overlay: only our own Blob uploads or direct https .mp4/.mov/.webm files.
  let overlayUrl = null;
  if (body.overlayUrl) {
    const o = validateVideoUrl(body.overlayUrl);
    if (!o || !o.startsWith('https://') || !(isBlobUrl(o) || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(o))) {
      return NextResponse.json({ success: false, message: 'Facecam must be an uploaded video or a direct https link to an MP4/MOV/WebM file.' }, { status: 400 });
    }
    overlayUrl = toFetchable(o);
  }
  // Free accounts keep the watermark on re-renders; Pro and credit holders don't.
  const email = paidEmail(request);
  const ent = email ? await getEntitlement(email).catch(() => null) : null;
  const watermark = !(ent?.pro || ent?.credits > 0);
  const brand = sanitizeBrand(body.brand);
  // Library clips keep pointing at their source. Fail clearly if it's gone.
  if (isBlobUrl(source)) {
    const ok = await head(source).then(() => true).catch(() => false);
    if (!ok) return NextResponse.json({ success: false, code: 'source_gone', message: 'The original video for this clip is no longer stored, so it can\'t be re-rendered. Upload or paste the video again to make a new clip.' }, { status: 410 });
  }
  // YouTube clips: re-render from the copy of the source the generate run already stored in
  // Blob (a direct file, fast frame-accurate seek, same resolution as the original clip)
  // instead of making RenderIO re-download from YouTube, which often stalls past the limit.
  let renderSrc = source;
  let stored = false;
  const yid = !isBlobUrl(source) ? youtubeIdOf(source) : null;
  if (yid) {
    for (const k of [`ysrc2:${yid}`, `ysrc:${yid}`]) {
      const c = await kvGetJson(k).catch(() => null);
      if (c?.blob && await head(c.blob).then(() => true).catch(() => false)) { renderSrc = c.blob; stored = true; break; }
    }
  }
  try {
    const url = await renderioCut(toFetchable(renderSrc), start, outLen, rio, words.length ? '' : String(body.caption || '').slice(0, 80), vertical, { long: len > 90, ...(len > 90 ? { timeoutMs: 250000 } : {}),
      wordCaptions: true, timedWords: words, userCrop, keep, broll: false, style: body.style, crop, brand, logoUrl: brand?.logoUrl ? toFetchable(brand.logoUrl) : null, hook, credit: String(body.credit || '').slice(0, 40), progress: !!body.progress, zoom: ['punch', 'tight'].includes(body.zoom) ? body.zoom : '', bg: ['blur', 'black'].includes(body.bg) ? body.bg : '', overlayUrl, direct: (isBlobUrl(source) || stored) && !overlayUrl, timeoutMs: len > 90 ? 240000 : 150000, watermark,
    });
    // RenderIO output links are temporary: keep a permanent copy for the library and Download.
    let videoUrl = url;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const r = await fetch(url);
        if (r.ok) videoUrl = toFetchable((await put(`clips/edit_${Date.now()}.mp4`, Buffer.from(await r.arrayBuffer()), { access: 'private', contentType: 'video/mp4', addRandomSuffix: true })).url, 365 * 24 * 3600);
      } catch (e) { console.warn('rerender blob copy failed', e?.message); }
    }
    return NextResponse.json({ success: true, videoUrl });
  } catch (e) {
    console.warn('rerender failed', e?.message);
    if (e?.capacity) return NextResponse.json({ success: false, message: e.message }, { status: 503 });
    const m = String(e?.message || '');
    if (/404|403|410|not found|unable to (open|download)|no such file|HTTP error|Unsupported URL|Video unavailable|Private video/i.test(m)) {
      return NextResponse.json({ success: false, code: 'source_gone', message: 'The original video couldn\'t be downloaded (it may have been removed or made private). Paste or upload it again to make a new clip.' }, { status: 410 });
    }
    if (/timeout/i.test(m)) return NextResponse.json({ success: false, code: 'timeout', message: 'Rendering took too long. Try a shorter clip or try again in a minute.' }, { status: 504 });
    return NextResponse.json({ success: false, code: 'render_failed', message: `Re-render failed (${m.slice(0, 80) || 'unknown error'}). Try again.` }, { status: 502 });
  }
}
