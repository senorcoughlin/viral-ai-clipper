export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { checkLimit, clientIp, freeUsed, FREE_DAILY_LIMIT } from '../../../lib/ratelimit';
import { getEntitlement, consumeCredit, refundCredit } from '../../../lib/billing';
import { paidEmail } from '../../../lib/session';
import { renderioRun, renderioCut, sanitizeBrand } from '../../../lib/render';
import { newMeter, withMeter, meterGemini, meterWhisper, saveRun } from '../../../lib/metrics';

// Longest source we accept. Long sources make RenderIO's download+cut slower and
// risk the 300s function limit (seen in production). Override with MAX_SOURCE_MINUTES.
const MAX_SOURCE_SECONDS = Number(process.env.MAX_SOURCE_MINUTES || 120) * 60;

// Best-effort YouTube duration lookup (seconds) from the public watch page.
async function youtubeDuration(id) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}&hl=en`, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'Mozilla/5.0' },
      signal: ctrl.signal, cache: 'no-store',
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const html = await r.text();
    // Only a hard ERROR means the video is gone; LOGIN_REQUIRED is often YouTube bot-checking our server IP.
    if (/"playabilityStatus":\{"status":"ERROR"/.test(html) && !/"lengthSeconds"/.test(html)) return 0;
    const m = html.match(/"lengthSeconds":"(\d+)"/);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}
import { validateVideoUrl } from '../../../lib/validate';
import { kvEnabled, kvGetJson, kvSetJson } from '../../../lib/kv';

const exec = promisify(execFile);
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

function youtubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/(shorts|embed)\/([^/?]+)/);
    if (m) return m[2];
  } catch {}
  return null;
}

// Transcript shape used everywhere below: { text, segments: [{ start, end, text }] }
// Timestamps are what let the AI cut at the right second and let captions
// land on the spoken word instead of being spread evenly across the clip.
const EMPTY_TRANSCRIPT = { text: '', segments: [] };

async function fetchTranscript(url) {
  const id = youtubeId(url);
  if (!id) return EMPTY_TRANSCRIPT;
  try {
    const { YouTubeTranscriptApi } = await import('extract-youtube');
    const api = new YouTubeTranscriptApi();
    const tr = await api.fetch(id);
    const raw = typeof tr.toRawData === 'function' ? tr.toRawData() : tr;
    const snippets = raw?.snippets || raw?.transcript || raw || [];
    if (!Array.isArray(snippets)) return { text: String(raw || ''), segments: [] };
    const segments = snippets
      .map(s => {
        const text = String(s?.text ?? s ?? '').replace(/\s+/g, ' ').trim();
        const start = Number(s?.start ?? s?.offset ?? NaN);
        const dur = Number(s?.duration ?? s?.dur ?? 0);
        return text && Number.isFinite(start) ? { start, end: start + (dur > 0 ? dur : 2), text } : null;
      })
      .filter(Boolean);
    return { text: segments.map(s => s.text).join(' '), segments };
  } catch (e) {
    // Many videos simply have no captions; this is expected, not an error.
    console.warn('transcript unavailable:', String(e?.message || e).split('\n')[0].slice(0, 160));
    return EMPTY_TRANSCRIPT;
  }
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// "[00:12] text" lines, trimmed to a token budget. Merges short caption
// fragments into ~4s lines so the model sees phrases, not word confetti.
function timestampedTranscript(transcript, maxChars = 24000) {
  const segs = transcript?.segments || [];
  if (!segs.length) return (transcript?.text || '').slice(0, maxChars);
  const lines = [];
  let cur = null;
  for (const s of segs) {
    if (cur && s.start - cur.start < 4) { cur.text += ' ' + s.text; cur.end = s.end; }
    else { if (cur) lines.push(cur); cur = { ...s }; }
  }
  if (cur) lines.push(cur);
  let out = '';
  for (const l of lines) {
    const line = `[${fmtTime(l.start)}] ${l.text}\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out;
}

// Words spoken inside [start, start+len], with times relative to the clip start.
function wordsInWindow(transcript, start, len) {
  const segs = transcript?.segments || [];
  const end = start + len;
  const out = [];
  for (const s of segs) {
    if (s.end <= start || s.start >= end) continue;
    const words = s.text.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const step = Math.max(0.12, (s.end - s.start) / words.length);
    words.forEach((w, i) => {
      const a = s.start + i * step;
      const b = a + step;
      if (a >= start && a < end) out.push({ w, a: a - start, b: Math.min(b, end) - start });
    });
  }
  return out;
}


const SAMPLE_VIDEOS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4',
];

async function scoreWithGemini(transcript, videoUrl, format, style, length, count = 1) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const timed = !!transcript?.segments?.length;
  const prompt = `You are a top short-form editor who has studied what gets replayed and shared on TikTok, Reels and Shorts.
From this ${timed ? 'timestamped ' : ''}transcript, pick the ${count} best self-contained moments of about ${length} seconds.

How to choose:
- The first 1-2 seconds must be a hook: a bold claim, a question, a number, a contradiction, or the middle of a story. Never start on "so", "um", "and", or a sentence that needs earlier context.
- Each clip must make sense with zero context and end on a complete thought, punchline, or payoff. Cut before the next topic starts.
- Prefer concrete, emotional, surprising, or contrarian moments over summaries and transitions.
- Score 1-99 for how likely this clip is to stop the scroll and get shared. Be honest: most moments are 60-80. Reserve 90+ for exceptional ones.
${timed ? `- startSec MUST be a second where a sentence begins, taken from the [mm:ss] markers (convert to seconds). Do not invent times outside the transcript range.` : ''}
Return ONLY valid JSON with ${count} clip${count === 1 ? '' : 's'}, ranked best first:
{"clips":[{"title":"short punchy title","hook":"on-screen hook, under 8 words","hooks":["hook a","hook b","hook c"],"caption":"post caption with a CTA","hashtags":"#tag1 #tag2 #tag3","bestTime":"Tue 7pm","score":72,"startSec":<number>,"endSec":<startSec + ${length}>,"reason":"one sentence on why this moment works"}]}
Clips must not overlap. startSec/endSec are seconds from the start of the video.
Video: ${videoUrl}
Format: ${format}
Style: ${style}
Transcript:
${timed ? timestampedTranscript(transcript) : String(transcript?.text || transcript || '').slice(0, 14000)}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192, responseMimeType: 'application/json' },
      }),
    });
    clearTimeout(timer);
    if (!res.ok) { console.warn('gemini failed', res.status, (await res.text().catch(() => '')).slice(0, 200)); return null; }
    const data = await res.json();
    meterGemini('score', data?.usageMetadata);
    const text = (data?.candidates?.[0]?.content?.parts || []).filter(p => !p.thought && p.text).map(p => p.text).join('');
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }
    if (!Array.isArray(parsed?.clips)) { console.warn('gemini no clips', data?.candidates?.[0]?.finishReason, text.slice(0, 200)); return null; }
    parsed.clips = parsed.clips
      .filter(c => c && typeof c === 'object')
      .map(c => ({ ...c, startSec: Math.max(0, Number(c.startSec) || 0), score: Math.min(99, Math.max(1, Math.round(Number(c.score)) || 60)) }));
    console.log('gemini scores', parsed.clips.map(c => [c.startSec, c.score]));
    return parsed.clips.length ? parsed : null;
  } catch (e) {
    console.warn('gemini error', e?.message);
    return null;
  }
}

async function transcribe(audioPath) {
  try { return await transcribeBuffer(await fs.readFile(audioPath)); } catch { return EMPTY_TRANSCRIPT; }
}

async function transcribeBuffer(buf) {
  const key = process.env.GROQ_API_KEY;
  if (!key || !buf?.length) return EMPTY_TRANSCRIPT;
  try {
    const form = new FormData();
    form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3');
    form.append('model', 'whisper-large-v3-turbo');
    // Word-level timestamps: this is what makes captions land on the spoken word.
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('timestamp_granularities[]', 'segment');
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      console.warn('groq transcribe failed', res.status, (await res.text().catch(() => '')).slice(0, 200));
      return EMPTY_TRANSCRIPT;
    }
    const data = await res.json();
    meterWhisper(data.duration);
    const words = Array.isArray(data.words) ? data.words : [];
    const segments = words.length
      ? words.map(w => ({ start: Number(w.start) || 0, end: Number(w.end) || (Number(w.start) || 0) + 0.3, text: String(w.word || '').trim() })).filter(w => w.text)
      : (Array.isArray(data.segments) ? data.segments.map(s => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || '').trim() })).filter(s => s.text) : []);
    return { text: data.text || segments.map(s => s.text).join(' '), segments };
  } catch {
    return EMPTY_TRANSCRIPT;
  }
}


const AUDIO_CAP_SEC = 90 * 60;
const GROQ_MAX_BYTES = 25 * 1024 * 1024;
async function audioTranscript(url, timeoutMs) {
  const rio = process.env.RENDERIO_API_KEY;
  if (!rio || !process.env.GROQ_API_KEY) return EMPTY_TRANSCRIPT;
  const t0 = Date.now();
  const audioUrl = await renderioRun({
    input_urls: { in_video: url },
    ffmpeg_command: `-i {{in_video}} -t ${AUDIO_CAP_SEC} -map 0:a:0 -vn -ac 1 -ar 16000 -c:a libmp3lame -b:a 32k {{out_audio}}`,
    output_files: { out_audio: 'audio.mp3' },
  }, 'out_audio', rio, timeoutMs);
  const r = await fetch(audioUrl, { cache: 'no-store' });
  if (!r.ok) throw new Error('audio download ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > GROQ_MAX_BYTES) throw new Error('audio too large for Whisper');
  const t1 = Date.now();
  const tr = await transcribeBuffer(buf);
  console.log('audio transcript', { extractMs: t1 - t0, whisperMs: Date.now() - t1, bytes: buf.length, words: tr.segments.length });
  return tr;
}

// Server-side face tracking for vertical crops. One RenderIO job grabs 3 frames
// across the clip window as a single 3x1 contact sheet; Gemini vision returns the
// speaker's horizontal face center in each frame; we crop around the median.
async function faceCropFor(url, start, len, timeoutMs = 45000) {
  const rio = process.env.RENDERIO_API_KEY;
  const gkey = process.env.GEMINI_API_KEY;
  if (!rio || !gkey) return null;
  try {
    const t0 = Date.now();
    const sheetUrl = await renderioRun({
      input_urls: { in_video: url },
      ffmpeg_command: `-ss ${Number(start) || 0} -i {{in_video}} -t ${Number(len) || 30} -vf "fps=3/${Number(len) || 30},scale=480:-2,tile=3x1" -frames:v 1 -q:v 4 {{out_img}}`,
      output_files: { out_img: 'sheet.jpg' },
    }, 'out_img', rio, timeoutMs);
    const img = await fetch(sheetUrl, { cache: 'no-store' });
    if (!img.ok) return null;
    const b64 = Buffer.from(await img.arrayBuffer()).toString('base64');
    const prompt = 'This image is 3 video frames side by side (left, middle, right). For each frame, find the main speaker\'s face (the person talking or most prominent). Return ONLY JSON {"faces":[x1,x2,x3]} where each x is the horizontal center of that face as a fraction 0-1 of THAT frame\'s width, or null if no face.';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(gkey)}`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: b64 } }, { text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: 'application/json' },
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    meterGemini('face', data?.usageMetadata);
    const text = (data?.candidates?.[0]?.content?.parts || []).filter(p => !p.thought && p.text).map(p => p.text).join('');
    const xs = (JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}').faces || []).map(Number).filter(x => Number.isFinite(x) && x >= 0 && x <= 1).sort((a, b) => a - b);
    console.log('face track', { ms: Date.now() - t0, xs });
    if (!xs.length) return null;
    const cx = xs[Math.floor(xs.length / 2)];
    // After scaling a 16:9 source to 1280 tall it is ~2276 wide; centre a 720 window on the face.
    const W = 2276;
    const f = Math.max(0, Math.min(1, (cx * W - 360) / (W - 720)));
    return `scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280:x=(iw-720)*${f.toFixed(3)}:y=(ih-1280)/5`;
  } catch (e) {
    console.warn('face track failed', e?.message);
    return null;
  }
}

// Transcripts are cached per video for a week so repeat runs skip extraction.
const trKey = (url) => 'tr:' + (youtubeId(url) || String(url).trim());
async function getCachedTranscript(url) {
  if (!kvEnabled) return null;
  const v = await kvGetJson(trKey(url));
  if (!v?.s?.length) return null;
  const segments = v.s.map(([start, end, text]) => ({ start, end, text }));
  return { text: segments.map(x => x.text).join(' '), segments };
}
async function setCachedTranscript(url, tr) {
  if (!kvEnabled || !tr?.segments?.length) return;
  const s = tr.segments.map(x => [Math.round(x.start * 100) / 100, Math.round(x.end * 100) / 100, x.text]);
  await kvSetJson(trKey(url), { s }, 7 * 24 * 3600);
}

async function downloadSource(url, dir) {
  const key = process.env.TUNELIO_API_KEY;
  if (!key) return { path: null, error: 'TUNELIO_API_KEY missing' };
  try {
    const create = await fetch(
      'https://tunelio.dev/create?' + new URLSearchParams({ url, quality: '360p' }),
      { headers: { Authorization: 'Bearer ' + key } }
    );
    if (!create.ok) {
      const body = await create.text();
      return { path: null, error: 'tunelio ' + create.status + ' ' + body.slice(0, 180) };
    }
    const data = await create.json();
    const fileUrl = data.url || data.downloadUrl;
    if (!fileUrl) return { path: null, error: 'tunelio no url: ' + JSON.stringify(data).slice(0, 180) };
    const file = await fetch(fileUrl);
    if (!file.ok) return { path: null, error: 'file download ' + file.status };
    const buf = Buffer.from(await file.arrayBuffer());
    const out = path.join(dir, 'source.mp4');
    await fs.writeFile(out, buf);
    return { path: out, error: null };
  } catch (e) {
    return { path: null, error: e?.message || String(e) };
  }
}

async function cutClip(src, start, length, outPath) {
  const ffmpeg = require('ffmpeg-static');
  if (!ffmpeg) return { ok: false, error: 'ffmpeg missing' };
  const attempts = [
    ['-y', '-ss', String(start), '-i', src, '-t', String(length), '-c', 'copy', '-movflags', '+faststart', outPath],
    ['-y', '-ss', String(start), '-i', src, '-t', String(length), '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'ultrafast', '-movflags', '+faststart', outPath],
  ];
  let last = 'ffmpeg failed';
  for (const args of attempts) {
    try {
      await exec(ffmpeg, args);
      return { ok: true, error: null };
    } catch (e) {
      last = e?.message || String(e);
    }
  }
  return { ok: false, error: last.slice(0, 180) };
}

// Recent results cache, keyed by URL + options. Uses KV/Redis when configured so
// it survives across serverless instances; otherwise per-instance memory.
const CACHE_TTL_SEC = 60 * 30;
const recentCache = new Map();
function cacheKey(url, opts) { return 'gen:' + JSON.stringify([String(url || '').trim(), opts]); }
async function getCached(key) {
  if (kvEnabled) return kvGetJson(key);
  const hit = recentCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_SEC * 1000) { recentCache.delete(key); return null; }
  return hit.clips;
}
async function setCached(key, clips) {
  if (kvEnabled) { await kvSetJson(key, clips, CACHE_TTL_SEC); return; }
  recentCache.set(key, { at: Date.now(), clips });
  if (recentCache.size > 20) {
    const first = recentCache.keys().next().value;
    recentCache.delete(first);
  }
}

// Run async jobs with at most `limit` in flight; results keep their index.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { videoUrl: rawUrl, clipFormat = 'shorts_9_16', aiStyle = 'character_swap', autoSubtitles, aiHook, clipCount = 1, faceCrop } = body;
  // The browser may suggest a crop filter; only accept the exact shape cropFromFace() builds.
  const brand = sanitizeBrand(body.brand);
  const safeClientCrop = typeof faceCrop === 'string' && /^scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280:x=\(iw-720\)\*[01]\.\d{3}:y=\(ih-1280\)\*[01]\.\d{3}$/.test(faceCrop) ? faceCrop : null;
  const clipLength = Math.min(90, Math.max(5, Math.round(Number(body.clipLength)) || 30));
  const count = Math.min(8, Math.max(1, Math.round(Number(clipCount)) || 1));
  if (!rawUrl) return NextResponse.json({ success: false, message: 'Missing videoUrl' }, { status: 400 });
  const videoUrl = validateVideoUrl(rawUrl);
  if (!videoUrl) {
    return NextResponse.json({ success: false, message: 'That doesn\'t look like a public video link. Paste a YouTube (or other public video) URL.' }, { status: 400 });
  }
  const ytId = youtubeId(videoUrl);
  if (ytId) {
    const secs = await youtubeDuration(ytId);
    if (secs === 0) {
      return NextResponse.json({ success: false, message: 'That YouTube video is unavailable (private, removed, or region-locked). Try another link.' }, { status: 400 });
    }
    if (secs && secs > MAX_SOURCE_SECONDS) {
      return NextResponse.json({ success: false, message: `That video is ${Math.round(secs / 60)} minutes long. The limit is ${Math.round(MAX_SOURCE_SECONDS / 60)} minutes — trim it or use a shorter upload.` }, { status: 400 });
    }
  }

  // Identity comes only from the signed session cookie, never from the request body.
  const ip = clientIp(request);
  const email = paidEmail(request);
  const ent = email ? await getEntitlement(email).catch(() => null) : null;
  const pro = !!ent?.pro;
  let creditSpent = false;
  if (!pro && ent?.credits > 0 && (await freeUsed(ip)) >= FREE_DAILY_LIMIT) {
    // Free allowance is used up: spend one server-side credit up front (atomic).
    creditSpent = await consumeCredit(email).catch(() => false);
  }
  const tier = pro ? 'pro' : creditSpent ? 'credits' : 'free';
  const limit = await checkLimit(ip, tier);
  if (!limit.ok) {
    if (creditSpent) await refundCredit(email).catch(() => {});
    return NextResponse.json({ success: false, message: limit.message, limitReached: !!limit.limitReached }, { status: limit.status });
  }
  // Give the usage slot (and credit) back when the run produces no real clips.
  let refunded = false;
  const refundUsage = async () => {
    if (refunded) return;
    refunded = true;
    await limit.refund?.();
    if (creditSpent) await refundCredit(email).catch(() => {});
  };

  try {
  const vertical = clipFormat === 'shorts_9_16';
  // Shared state filled in by the setup steps inside the stream.
  const ctx = { dir: null, source: null, transcript: EMPTY_TRANSCRIPT, downloadError: null };
  // When the AI can't score (no transcript, or the model call failed) we still
  // cut evenly spaced clips, but we say so instead of inventing viral scores.
  const unscoredClips = (n) => {
    const segs = ctx.transcript?.segments || [];
    const lastSec = segs.length ? segs[segs.length - 1].end : 0;
    const span = Math.max(Number(clipLength) * n + 10, lastSec - Number(clipLength));
    const gap = Math.max(Number(clipLength) + 2, Math.floor(span / n));
    return Array.from({ length: n }, (_, i) => ({
      title: `Clip ${i + 1}`,
      hook: '',
      hooks: [],
      caption: '',
      hashtags: '',
      bestTime: '',
      score: 0,
      scored: false,
      startSec: 5 + i * gap,
      reason: 'No transcript was available, so this clip was not scored. Use a video with speech or captions to get AI-chosen moments.',
    }));
  };

  async function runOne(c, i) {
    const start = Number(c.startSec || 0);
    const len = Number(clipLength);
    let playUrl = SAMPLE_VIDEOS[i % SAMPLE_VIDEOS.length];
    let real = false;

    const rio = process.env.RENDERIO_API_KEY;
    if (rio) {
      try {
        const label = autoSubtitles !== false && c.scored !== false ? (c.hook || c.title || '') : '';
        const timedWords = autoSubtitles !== false ? wordsInWindow(ctx.transcript, start, len) : [];
        // Track the speaker for vertical clips while there's time left in the 300s budget.
        let crop = null;
        if (vertical && Date.now() - (ctx.startedAt || Date.now()) < 150000) crop = await faceCropFor(videoUrl, start, len);
        playUrl = await renderioCut(videoUrl, start, len, rio, label, vertical, { wordCaptions: true, timedWords, broll: false, style: aiStyle, crop: crop || safeClientCrop, brand });
        c._crop = crop || safeClientCrop || null;
        c._words = timedWords;
        real = true;
      } catch (e) {
        ctx.downloadError = e?.message || String(e);
      }
    } else if (ctx.source) {
      const out = path.join(ctx.dir, `clip_${i}.mp4`);
      const cut = await cutClip(ctx.source, start, len, out);
      let ok = cut.ok;
      let fileToUpload = out;
      if (!cut.ok) {
        ctx.downloadError = cut.error;
        fileToUpload = ctx.source;
        ok = true;
      }
      if (ok && process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const buf = await fs.readFile(fileToUpload);
          const blob = await put(`clips/${Date.now()}_${i}.mp4`, buf, {
            access: 'public',
            contentType: 'video/mp4',
          });
          playUrl = blob.url;
          real = true;
        } catch (e) {
          console.error('blob upload failed', e?.message);
        }
      }
    }

    return {
      id: `c_${Date.now()}_${i + 1}`,
      title: c.title,
      hook: aiHook ? (c.hook || '') : '',
      hooks: Array.isArray(c.hooks) ? c.hooks.slice(0, 3) : [c.hook].filter(Boolean),
      score: c.scored === false ? 0 : (c.score || 70),
      viralScore: c.scored === false ? 0 : (c.score || 70),
      scored: c.scored !== false,
      duration: `${len}s`,
      format: clipFormat,
      style: aiStyle,
      caption: autoSubtitles ? (c.caption || '') : '',
      socialCaption: c.caption || '',
      hashtags: c.hashtags || '',
      bestTime: c.bestTime || '',
      aiPrompt: c.reason || c.hook || '',
      reason: c.reason || c.hook || '',
      videoUrl: playUrl,
      source: videoUrl,
      startSec: start,
      endSec: start + len,
      // Kept so the caption editor can re-render this clip with the same timing/crop.
      words: (c._words || []).slice(0, 200).map(w => ({ w: w.w, a: Math.round(w.a * 100) / 100, b: Math.round(w.b * 100) / 100 })),
      crop: c._crop || null,
      preview: !real,
    };
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const meter = newMeter();
      const t0 = Date.now();
      return withMeter(meter, async () => {
      const send = (obj) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n')); } catch {}
      };
      try {
      const key = cacheKey(videoUrl, [clipFormat, aiStyle, Number(clipLength), autoSubtitles !== false, !!aiHook, brand]);
      const hit = await getCached(key);
      const realHit = Array.isArray(hit) ? hit.filter(c => c && !c.preview) : [];
      const cached = realHit.length >= count ? realHit.slice(0, count) : null;
      if (cached && cached.length) {
        ctx.cachedHit = true;
        ctx.runClips = cached;
        send({ type: 'start', total: cached.length, cached: true });
        for (let i = 0; i < cached.length; i++) {
          send({ type: 'clip', index: i, total: cached.length, clip: cached[i] });
        }
        send({ type: 'done', note: 'Served from recent cache.', total: cached.length, cached: true });
        controller.close();
        return;
      }
      // Tell the client right away that work has started; setup happens below.
      const startedAt = Date.now();
      ctx.startedAt = startedAt;
      send({ type: 'start', total: count });
      send({ type: 'status', step: 'transcript' });
      ctx.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-')).catch(() => null);
      const cachedTr = await getCachedTranscript(videoUrl).catch(() => null);
      // Cold run: start the RenderIO audio -> Whisper path at the same time as the
      // YouTube caption fetch (captions are usually blocked from Vercel). If captions
      // win, the audio result is simply ignored.
      let audioP = null;
      if (!cachedTr && process.env.RENDERIO_API_KEY && process.env.GROQ_API_KEY) {
        audioP = audioTranscript(videoUrl, 150000).catch((e) => { console.warn('audio transcript failed', e?.message); return EMPTY_TRANSCRIPT; });
      }
      ctx.transcript = cachedTr || (ytId ? await fetchTranscript(videoUrl) : EMPTY_TRANSCRIPT);
      ctx.transcriptSource = cachedTr ? 'cache' : ctx.transcript?.segments?.length ? 'youtube' : null;
      try {
        if (process.env.RENDERIO_API_KEY) {
          // RenderIO handles download + cut. If captions were blocked, use the
          // Whisper word timestamps that are already being produced.
          if (!ctx.transcript?.segments?.length && audioP) {
            send({ type: 'status', step: 'transcript', detail: 'audio' });
            ctx.transcript = await audioP;
            ctx.transcriptSource = ctx.transcript?.segments?.length ? 'whisper' : null;
          }
        } else if (ctx.dir) {
          send({ type: 'status', step: 'download' });
          const dl = await downloadSource(videoUrl, ctx.dir);
          ctx.source = dl?.path || null;
          ctx.downloadError = dl?.error || null;
          if (ctx.source) {
            const audio = path.join(ctx.dir, 'audio.mp3');
            const ffmpeg = require('ffmpeg-static');
            if (ffmpeg) {
              try {
                await exec(ffmpeg, ['-y', '-i', ctx.source, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', audio]);
                ctx.transcript = await transcribe(audio);
              } catch {}
            }
          }
        }
      } catch {}

      if (!cachedTr && ctx.transcript?.segments?.length) setCachedTranscript(videoUrl, ctx.transcript).catch(() => {});
      send({ type: 'status', step: 'scoring', hasTranscript: !!ctx.transcript?.text });
      let scored = ctx.transcript?.text ? await scoreWithGemini(ctx.transcript, videoUrl, clipFormat, aiStyle, clipLength, count) : null;
      if (!scored && ctx.transcript?.text && Date.now() - startedAt < 170000) {
        scored = await scoreWithGemini(ctx.transcript, videoUrl, clipFormat, aiStyle, clipLength, count); // one retry
      }
      const base = scored?.clips?.length ? scored.clips.slice(0, count).map(c => ({ ...c, scored: true })) : unscoredClips(count);

      send({ type: 'status', step: 'cutting', total: base.length });
      // Cut all requested clips in parallel; each one streams to the client the
      // moment its job finishes (a 1-clip run streams that clip and ends right after).
      // At most 4 RenderIO jobs in flight; the first ones start immediately.
      const results = await mapLimit(base, 4, async (c, i) => {
        try {
          const clip = await runOne(c, i);
          if (clip.preview) {
            // Never ship a stock sample as if it were the user's clip.
            send({ type: 'error', index: i, message: ctx.downloadError || 'cut failed' });
            return null;
          }
          send({ type: 'clip', index: i, total: base.length, clip });
          return clip;
        } catch (e) {
          send({ type: 'error', index: i, message: e?.message || 'cut failed' });
          return null;
        }
      });
      const clips = results.filter(Boolean);
      ctx.runClips = clips;
      ctx.runFailed = base.length - clips.length;
      if (clips.length) await setCached(key, clips);
      try { if (ctx.dir) await fs.rm(ctx.dir, { recursive: true, force: true }); } catch {}
      const real = clips.length;
      if (!real) {
        await refundUsage();
        const why = ctx.downloadError || 'Video processing is unavailable right now.';
        send({ type: 'error', message: `No clips could be made from that video (${String(why).slice(0, 200)}). This run was not counted.` });
        send({ type: 'done', total: 0, real: 0, preview: 0, failed: base.length, refunded: true, reason: why });
        controller.close();
        return;
      }
      send({
        type: 'done',
        note: real ? 'Cut from your source video.' : (ctx.downloadError || 'Preview clips.'),
        total: clips.length,
        real,
        preview: clips.length - real,
        failed: base.length - clips.length,
        reason: real ? null : (ctx.downloadError || 'Video processing is unavailable right now.'),
      });
      controller.close();
      } catch (e) {
        console.error('generate stream failed', e);
        await refundUsage().catch(() => {});
        send({ type: 'error', message: e?.message || 'generate failed' });
        send({ type: 'done', note: 'Stopped early.', total: 0 });
        try { controller.close(); } catch {}
      }
      }).finally(() => saveRun({
        at: t0, ms: Date.now() - t0, video: youtubeId(videoUrl) || String(videoUrl).slice(0, 120),
        requested: count, clipLength, tier, cached: !!ctx.cachedHit,
        transcript: ctx.transcriptSource || null,
        clips: (ctx.runClips || []).map(c => ({ score: c.viralScore || 0, scored: c.scored !== false })),
        failed: ctx.runFailed || 0,
        meter,
      }));
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
  } catch (e) {
    console.error('generate failed', e);
    return NextResponse.json({ success: false, message: e?.message || 'generate failed' }, { status: 500 });
  }
}
