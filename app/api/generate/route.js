export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { reportError } from '../../../lib/alerts';
import { put } from '@vercel/blob';
import { execFile } from 'child_process';
import { ffmpegPath } from '../../../lib/ffmpegbin';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
const EXAMPLE_YT_ID = 'jNQXAC9IVRw';
import { flagOn } from '../../../lib/siteconfig';
import { checkLimit, clientIp, freeUsed, FREE_DAILY_LIMIT } from '../../../lib/ratelimit';
import { getEntitlement, consumeCredit, refundCredit } from '../../../lib/billing';
import { paidEmail } from '../../../lib/session';
import { renderioRun, renderioCut, sanitizeBrand, HLS_FLAGS } from '../../../lib/render';
import { renderioLeft, CAPACITY_MESSAGE } from '../../../lib/capacity';
import { toFetchable, isBlobUrl } from '../../../lib/media';
import { newMeter, withMeter, meterGemini, meterWhisper, saveRun } from '../../../lib/metrics';

// Longest source we accept. Long sources make RenderIO's download+cut slower and
// risk the 300s function limit (seen in production). Override with MAX_SOURCE_MINUTES.
// YouTube is capped tighter until long-video processing lands (one run must fit in maxDuration).
const YT_MAX_SECONDS = Number(process.env.YT_MAX_MINUTES || 60) * 60;
const YT_TOO_LONG = `YouTube videos up to ${Math.round(Number(process.env.YT_MAX_MINUTES || 60))} minutes for now; upload the file for longer ones. This run was not counted.`;
const SRC_KEY = (id) => `ysrc2:${id}`; // v2: higher-res sources (old keys point at 480p files)
const LONG_SEC = 40 * 60; // use 360p for long YouTube sources (smaller, faster to pull)
// Source resolution for YouTube downloads. A 9:16 crop of a 16:9 frame only keeps ~56% of the
// width, so a 480p source was being upscaled ~2.7x into the 720x1280 clip (soft, blocky).
// Pull 1080p when the file comfortably fits the function's /tmp and time budget, else 720p.
function ytSourceFormat(secs) {
  if (process.env.YT_DOWNLOAD_FORMAT) return process.env.YT_DOWNLOAD_FORMAT;
  if (!(secs > 0)) return '720';
  if (secs <= Number(process.env.YT_1080_MAX_SEC || 12 * 60)) return '1080';
  if (secs <= 30 * 60) return '720';
  if (secs <= LONG_SEC) return '480';
  return '360';
}
const HANDOFF_AFTER_MS = Number(process.env.HANDOFF_AFTER_MS || 110000);
const RUN_BUDGET_MS = Number(process.env.RUN_BUDGET_MS || 270000); // stop cleanly before the 300s function limit
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
    if (/"isLive":true/.test(html) || /"isLiveNow":true/.test(html)) return -1; // currently live
    if (/"isUpcoming":true/.test(html)) return -2; // scheduled premiere / stream not started
    const m = html.match(/"lengthSeconds":"(\d+)"/);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}
import { validateVideoUrl } from '../../../lib/validate';
import { parseLinks, youtubeIdOf } from '../../../lib/links';
import { kvEnabled, kvGetJson, kvSetJson } from '../../../lib/kv';
import { routeGuard } from '../../../lib/ratelimit';
import { waitUntil } from '@vercel/functions';
import { youtubeDownloader, youtubeInfoDuration } from '../../../lib/downloader';
import { downloadToFile, probeDuration, localTranscript, segmentToBlob, clipAudio, localFfmpegAvailable } from '../../../lib/localprep';
import { fetchYoutubeSubtitles, subtitlesEnabled } from '../../../lib/subtitles';
import { reserveAudioSec, releaseAudioSec } from '../../../lib/groqbudget';
import { jobsEnabled, newJobId, createJob, jobWriter, touchJob, readJob, validJobId, readContinuation, continueSig } from '../../../lib/jobs';
import { refundSlot } from '../../../lib/ratelimit';
import { getVercelOidcToken } from '@vercel/functions/oidc';
import { parseStreamUrl, resolveStream, windowPlaylist } from '../../../lib/stream';

// Stream sources (Twitch/Kick) are transcribed in chunks so multi-hour VODs fit the
// 25 MB Whisper limit and the 300s function budget. Chunks run in parallel.
const STREAM_CHUNK_SEC = Number(process.env.STREAM_CHUNK_MINUTES || 60) * 60;
const STREAM_MAX_SEC = { free: Number(process.env.STREAM_MAX_MINUTES_FREE || 120) * 60, paid: Number(process.env.STREAM_MAX_MINUTES_PAID || 240) * 60 };
const LIVE_MINUTES = [5, 10, 15];
const fmtDur = (s) => { const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m} min`; };

// Audio for [start, start+len] of an HLS/MP4 source -> Whisper, with timestamps shifted to source time.
async function streamChunkTranscript(audioUrl, start, len, timeoutMs, mp4 = false) {
  const rio = process.env.RENDERIO_API_KEY;
  if (!rio || !process.env.GROQ_API_KEY) return EMPTY_TRANSCRIPT;
  const t0 = Date.now();
  const win = mp4 ? { url: audioUrl, offset: start } : await windowPlaylist(audioUrl, start, len, rio);
  const url = await renderioRun({
    input_files: { in_video: win.url },
    ffmpeg_command: `${mp4 ? '' : HLS_FLAGS}-ss ${win.offset.toFixed(2)} -i {{in_video}} -t ${Math.ceil(len)} -map 0:a:0 -vn -ac 1 -ar 16000 -c:a libmp3lame -b:a 32k {{out_audio}}`,
    output_files: { out_audio: 'audio.mp3' },
  }, 'out_audio', rio, timeoutMs);
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('audio download ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > GROQ_MAX_BYTES) throw new Error('audio too large for Whisper');
  const tr = await transcribeBuffer(buf);
  console.log('stream chunk transcript', { start, len, ms: Date.now() - t0, bytes: buf.length, words: tr.segments.length });
  const segments = tr.segments.map(x => ({ start: x.start + start, end: x.end + start, text: x.text }));
  return { text: tr.text, segments };
}

const exec = promisify(execFile);
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// Handles watch, youtu.be, shorts, embed and /live/<id> links.
function youtubeId(url) {
  return youtubeIdOf(url);
}

// Transcript shape used everywhere below: { text, segments: [{ start, end, text }] }
// Timestamps are what let the AI cut at the right second and let captions
// land on the spoken word instead of being spread evenly across the clip.
const EMPTY_TRANSCRIPT = { text: '', segments: [] };

async function fetchTranscript(url, attempts = 2) {
  for (let i = 0; i < attempts; i++) {
    const tr = await fetchTranscriptOnce(url);
    if (tr.segments.length || !youtubeId(url)) return tr;
    if (i < attempts - 1) await new Promise(r => setTimeout(r, 800));
  }
  return EMPTY_TRANSCRIPT;
}

async function fetchTranscriptOnce(url) {
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

function cleanReasons(r) {
  if (!r || typeof r !== 'object') return null;
  const out = {};
  for (const k of ['hook', 'pacing', 'clarity', 'emotion']) if (r[k]) out[k] = String(r[k]).replace(/\s+/g, ' ').trim().slice(0, 90);
  return Object.keys(out).length ? out : null;
}

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
{"clips":[{"title":"short punchy title","hook":"on-screen hook, under 8 words","hooks":["hook a","hook b","hook c"],"caption":"post caption with a CTA","hashtags":"#tag1 #tag2 #tag3","bestTime":"Tue 7pm","score":72,"startSec":<number>,"endSec":<startSec + ${length}>,"reason":"one sentence on why this moment works","reasons":{"hook":"under 10 words on the opening","pacing":"under 10 words on pacing","clarity":"under 10 words on whether it makes sense without context","emotion":"under 10 words on the emotion or CTA payoff"}}]}
Clips must not overlap. startSec/endSec are seconds from the start of the video.
Video: ${videoUrl}
Format: ${format}
Style: ${style}
Transcript:
${timed ? timestampedTranscript(transcript) : String(transcript?.text || transcript || '').slice(0, 14000)}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 55000);
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } },
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
      .map(c => ({ ...c, reasons: cleanReasons(c.reasons), startSec: Math.max(0, Number(c.startSec) || 0), score: (() => { let n = Number(c.score); if (n > 0 && n <= 10) n *= 10; return Math.min(99, Math.max(1, Math.round(n) || 60)); })() }));
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
    return { text: data.text || segments.map(s => s.text).join(' '), segments, src: words.length ? 'whisper' : 'whisper-seg' };
  } catch {
    return EMPTY_TRANSCRIPT;
  }
}


// Fallback transcription with Gemini (audio in, timestamped lines out) when Groq's quota is used up.
async function geminiTranscribe(buf, lenSec) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !buf?.length) return EMPTY_TRANSCRIPT;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    const prompt = 'Transcribe this audio verbatim. Return ONLY JSON {"lines":[{"t":seconds_from_start,"text":"..."}]} with one entry per sentence or short phrase (max ~12 words), t = when it starts, in seconds as a number.';
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: 'audio/mpeg', data: Buffer.from(buf).toString('base64') } }, { text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 32768, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } },
      }),
    });
    clearTimeout(timer);
    if (!res.ok) { console.warn('gemini transcribe failed', res.status); return EMPTY_TRANSCRIPT; }
    const data = await res.json();
    meterGemini('transcribe', data?.usageMetadata);
    const text = (data?.candidates?.[0]?.content?.parts || []).filter(p => !p.thought && p.text).map(p => p.text).join('');
    const lines = (JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}').lines || [])
      .map(l => ({ t: Number(l.t), text: String(l.text || '').trim() })).filter(l => Number.isFinite(l.t) && l.text && l.t <= (lenSec || 1e9) + 5)
      .sort((a, b) => a.t - b.t);
    const segments = lines.map((l, k) => ({ start: l.t, end: lines[k + 1] ? lines[k + 1].t : Math.min(l.t + 4, lenSec || l.t + 4), text: l.text }));
    return { text: segments.map(x => x.text).join(' '), segments };
  } catch (e) { console.warn('gemini transcribe failed', e?.message); return EMPTY_TRANSCRIPT; }
}

const AUDIO_CAP_SEC = 90 * 60;
const GROQ_MAX_BYTES = 25 * 1024 * 1024;
async function audioTranscript(url, timeoutMs, direct = false) {
  const rio = process.env.RENDERIO_API_KEY;
  if (!rio || !process.env.GROQ_API_KEY) return EMPTY_TRANSCRIPT;
  const t0 = Date.now();
  const audioUrl = await renderioRun({
    [direct ? 'input_files' : 'input_urls']: { in_video: url },
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
// Width/height from a JPEG's SOF marker.
function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

async function faceCropFor(url, start, len, timeoutMs = 45000, direct = false, hls = false) {
  const rio = process.env.RENDERIO_API_KEY;
  const gkey = process.env.GEMINI_API_KEY;
  if (!rio || !gkey) return null;
  try {
    const t0 = Date.now();
    const sheetUrl = await renderioRun({
      [direct ? 'input_files' : 'input_urls']: { in_video: url },
      ffmpeg_command: `${hls ? HLS_FLAGS : ''}-ss ${Number(start) || 0} -i {{in_video}} -t ${Number(len) || 30} -vf "fps=3/${Number(len) || 30},scale=480:-2,tile=3x1" -frames:v 1 -q:v 4 {{out_img}}`,
      output_files: { out_img: 'sheet.jpg' },
    }, 'out_img', rio, timeoutMs);
    const img = await fetch(sheetUrl, { cache: 'no-store' });
    if (!img.ok) return null;
    const jpg = Buffer.from(await img.arrayBuffer());
    const dims = jpegSize(jpg);
    const b64 = jpg.toString('base64');
    const prompt = 'This image is 3 video frames side by side (left, middle, right). For each frame, find the main speaker\'s face (the person talking or most prominent). Return ONLY JSON {"faces":[x1,x2,x3]} where each x is the horizontal center of that face as a fraction 0-1 of THAT frame\'s width, or null if no face.';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(gkey)}`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: b64 } }, { text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } },
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    meterGemini('face', data?.usageMetadata);
    const text = (data?.candidates?.[0]?.content?.parts || []).filter(p => !p.thought && p.text).map(p => p.text).join('');
    const xs = (JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}').faces || []).map(Number).filter(x => Number.isFinite(x) && x > 0.02 && x < 0.98) // 0/1 = model's "no face"
      .sort((a, b) => a - b);
    console.log('face track', { ms: Date.now() - t0, xs });
    if (!xs.length) return null;
    const cx = xs[Math.floor(xs.length / 2)];
    // Width of one frame once scaled to 1280 tall (from the contact sheet's real aspect).
    const aspect = dims ? (dims.w / 3) / dims.h : 16 / 9;
    if (aspect <= 9 / 16 + 0.01) return null; // already vertical: nothing to pan
    const W = 1280 * aspect;
    const f = Math.max(0, Math.min(1, (cx * W - 360) / (W - 720)));
    return `scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280:x=(iw-720)*${f.toFixed(3)}:y=(ih-1280)/5`;
  } catch (e) {
    console.warn('face track failed', e?.message);
    return null;
  }
}

// Transcripts are cached per video for a week so repeat runs skip extraction.
const trKey = (url) => 'tr2:' + (youtubeId(url) || String(url).trim());
async function getCachedTranscript(url) {
  if (!kvEnabled) return null;
  const v = await kvGetJson(trKey(url));
  if (!v?.s?.length) return null;
  const segments = v.s.map(([start, end, text]) => ({ start, end, text }));
  return { text: segments.map(x => x.text).join(' '), segments, src: v.src || null };
}
async function setCachedTranscript(url, tr) {
  if (!kvEnabled || !tr?.segments?.length) return;
  const s = tr.segments.map(x => [Math.round(x.start * 100) / 100, Math.round(x.end * 100) / 100, x.text]);
  await kvSetJson(trKey(url), { s, src: tr.src || null }, 7 * 24 * 3600);
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
  const ffmpeg = ffmpegPath();
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

// Resume/poll a background job: returns events from index `from` onward.
export async function GET(request) {
  const u = new URL(request.url);
  // Preview-only diagnostic: confirms the bundled ffmpeg binary resolves and runs.
  if (u.searchParams.get('diag') === 'ffmpeg' && process.env.VERCEL_ENV !== 'production' && process.env.TEST_BYPASS_SECRET
    && request.headers.get('x-test-bypass') === process.env.TEST_BYPASS_SECRET) {
    const bin = ffmpegPath();
    const v = bin ? await exec(bin, ['-version']).then(r => r.stdout.split('\n')[0]).catch(e => 'ERR ' + e.message) : null;
    return NextResponse.json({ bin, version: v, downloader: !!youtubeDownloader() });
  }
  const id = u.searchParams.get('job');
  const from = Math.max(0, parseInt(u.searchParams.get('from') || '0', 10) || 0);
  if (!validJobId(id)) return NextResponse.json({ found: false }, { status: 400 });
  const j = await readJob(id, from).catch(() => ({ found: false }));
  return NextResponse.json(j, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  const reqStart = Date.now(); // the 300s function clock starts here, not when the stream opens
  const limited = await routeGuard(request, 'generate', 60, 3600);
  if (limited) return limited;
  if (await flagOn('pause_generation')) return Response.json({ error: 'Clip generation is paused for a few minutes for maintenance. Please try again soon.' }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const { videoUrl: rawUrl, clipFormat = 'shorts_9_16', aiStyle: rawStyle, autoSubtitles, aiHook, clipCount = 1, faceCrop } = body;
  const pack = ['bold', 'podcast', 'gameplay'].includes(body.pack) ? body.pack : null;
  // The browser may suggest a crop filter; only accept the exact shape cropFromFace() builds.
  const brand = sanitizeBrand(body.brand);
  const safeClientCrop = typeof faceCrop === 'string' && /^scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280:x=\(iw-720\)\*[01]\.\d{3}:y=\(ih-1280\)\*[01]\.\d{3}$/.test(faceCrop) ? faceCrop : null;
  const clipLength = Math.min(900, Math.max(5, Math.round(Number(body.clipLength)) || 30));
  const aiStyle = ['clean_viral','character_swap','anime_action','kids_3d'].includes(rawStyle) ? rawStyle : 'clean_viral';
  const count = Math.min(8, Math.max(1, Math.round(Number(clipCount)) || 1));
  if (!rawUrl) return NextResponse.json({ success: false, message: 'Missing videoUrl' }, { status: 400 });
  // One video per request. If several links arrive glued together (no separator),
  // take only the first; the browser sends each link as its own request.
  const parsed = parseLinks(rawUrl, 1);
  if (parsed.found > 1) console.warn('generate: multiple links in one request; using first', { found: parsed.found });
  const videoUrl = validateVideoUrl(parsed.links[0] || rawUrl);
  if (!videoUrl) {
    return NextResponse.json({ success: false, message: 'That doesn\'t look like a public video link. Paste a YouTube (or other public video) URL.' }, { status: 400 });
  }
  const ytId = youtubeId(videoUrl);
  // Private uploads are handed to RenderIO through a signed, expiring proxy URL.
  const rioUrl = toFetchable(videoUrl);
  let ytSecs = 0;
  if (ytId) {
    const secs = (await youtubeInfoDuration(videoUrl)) ?? (await youtubeDuration(ytId));
    ytSecs = secs || 0;
    if (secs === -1) {
      return NextResponse.json({ success: false, message: 'That YouTube video is live right now. Live YouTube clipping isn\'t supported yet. Paste it again once the stream ends (the replay works), or use a Twitch channel link for "clip the last X minutes".', live: true }, { status: 400 });
    }
    if (secs === -2) {
      return NextResponse.json({ success: false, message: 'That YouTube stream hasn\'t started yet. Try again after it goes live and ends.' }, { status: 400 });
    }
    if (secs === 0) {
      return NextResponse.json({ success: false, message: 'That YouTube video is unavailable (private, removed, or region-locked). Try another link.' }, { status: 400 });
    }
    if (secs && secs > YT_MAX_SECONDS) {
      return NextResponse.json({ success: false, message: YT_TOO_LONG, tooLong: true }, { status: 400 });
    }
    if (secs && secs > MAX_SOURCE_SECONDS) {
      return NextResponse.json({ success: false, message: `That video is ${Math.round(secs / 60)} minutes long. The limit is ${Math.round(MAX_SOURCE_SECONDS / 60)} minutes — trim it or use a shorter upload.` }, { status: 400 });
    }
  }

  // Twitch / Kick: resolve to media playlists and decide which window to transcribe.
  const streamInfo = parseStreamUrl(videoUrl);
  let media = null;
  if (streamInfo) {
    try { media = await resolveStream(streamInfo); } catch (e) {
      if (e?.userFacing) return NextResponse.json({ success: false, message: e.message, code: e.code }, { status: 400 });
      await reportError('generate:stream', e, videoUrl);
      return NextResponse.json({ success: false, message: 'We could not read that stream right now. Try again in a minute.' }, { status: 502 });
    }
    const dur = Math.floor(Number(media.duration) || 0);
    if (media.live) {
      const mins = LIVE_MINUTES.includes(Number(body.liveMinutes)) ? Number(body.liveMinutes) : 10;
      // Stay ~20s back from the live edge: the newest segment is often still being written.
      const end = Math.max(0, dur - 20);
      media.winLen = Math.min(mins * 60, end);
      media.winStart = Math.max(0, end - media.winLen);
      media.liveMinutes = mins;
      if (media.winLen < Math.max(60, clipLength + 5)) {
        return NextResponse.json({ success: false, message: 'This stream only just started, so there isn\'t enough footage yet. Try again in a few minutes.' }, { status: 400 });
      }
    } else {
      media.winStart = 0;
      media.winLen = dur || 0;
    }
    if (!media.winLen) return NextResponse.json({ success: false, message: 'We could not read the length of that video. Try another link.' }, { status: 400 });
  }

  // Capacity pre-check (before charging usage): a run needs ~1 cut per clip plus audio and face jobs.
  const audioChunks = media ? Math.max(1, Math.ceil(media.winLen / STREAM_CHUNK_SEC)) : 1;
  if (process.env.RENDERIO_API_KEY && (await renderioLeft()) < count + 2 + audioChunks) {
    return NextResponse.json({ success: false, message: CAPACITY_MESSAGE, capacity: true }, { status: 503 });
  }

  // Identity comes only from the signed session cookie, never from the request body.
  const ip = clientIp(request);
  // Signed follow-up of an existing job (see hand-off below): same job, already charged.
  const cont = await readContinuation(request).catch(() => null);
  const email = cont ? (cont.email || null) : paidEmail(request);
  const ent = email ? await getEntitlement(email).catch(() => null) : null;
  const pro = !!ent?.pro;
  let creditSpent = false;
  // The homepage sample video is a free demo: it never spends a free slot or a credit.
  const isExample = ytId === EXAMPLE_YT_ID;
  if (!cont && !pro && !isExample && ent?.credits > 0 && (await freeUsed(ip)) >= FREE_DAILY_LIMIT) {
    // Free allowance is used up: spend one server-side credit up front (atomic).
    creditSpent = await consumeCredit(email).catch(() => false);
  }
  if (cont) creditSpent = !!cont.creditSpent;
  const tier = cont?.tier || (pro ? 'pro' : creditSpent ? 'credits' : isExample ? 'example' : 'free');
  if (media && !media.live && !media.mp4) {
    const max = tier === 'free' || tier === 'example' ? STREAM_MAX_SEC.free : STREAM_MAX_SEC.paid;
    if (media.winLen > max) {
      if (creditSpent) await refundCredit(email).catch(() => {});
      const paidMax = fmtDur(STREAM_MAX_SEC.paid);
      return NextResponse.json({
        success: false,
        message: tier === 'free'
          ? `That VOD is ${fmtDur(media.winLen)} long. Free runs handle streams up to ${fmtDur(max)}; Pro and credit runs handle up to ${paidMax}. Upgrade, or paste a Twitch clip or a shorter VOD.`
          : `That VOD is ${fmtDur(media.winLen)} long. The current limit is ${paidMax} per run. Paste a shorter VOD or a Twitch clip.`,
        tooLong: true,
      }, { status: 400 });
    }
  }
  const watermark = tier === 'free' || tier === 'example'; // Pro and credit-paid runs are never watermarked.
  // Test-only bypass (set TEST_BYPASS_SECRET on Preview only): skips daily usage counters.
  const bypass = !!process.env.TEST_BYPASS_SECRET && process.env.VERCEL_ENV !== 'production'
    && request.headers.get('x-test-bypass') === process.env.TEST_BYPASS_SECRET;
  const noCache = bypass && !!body.noCache;
  const limit = cont ? { ok: true, refund: () => refundSlot(cont.slotKey), key: cont.slotKey }
    : bypass ? { ok: true, refund: async () => {}, key: null } : await checkLimit(ip, tier);
  if (!limit.ok) {
    if (creditSpent) await refundCredit(email).catch(() => {});
    return NextResponse.json({ success: false, message: limit.message, limitReached: !!limit.limitReached }, { status: limit.status });
  }
  // Give the usage slot (and credit) back when the run produces no real clips.
  let refunded = false;
  // The run is a server-side job: it keeps going if the browser backgrounds or drops
  // the stream, and the client can resume it via GET /api/generate?job=<id>.
  const jobId = cont ? cont.jobId : jobsEnabled ? newJobId() : null;
  if (jobId && !cont) await createJob(jobId, { slotKey: limit.key, creditSpent, email: creditSpent ? email : null, tier }).catch(() => {});
  const refundUsage = async () => {
    if (refunded) return;
    refunded = true;
    if (jobId) await touchJob(jobId, { refunded: true });
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
    if (media) {
      // Spread evenly across the stream window (absolute source time).
      const usable = Math.max(0, media.winLen - Number(clipLength) - 2);
      const n2 = Math.max(1, Math.min(n, Math.floor(media.winLen / Number(clipLength)) || 1));
      return Array.from({ length: n2 }, (_, i) => {
        const st = Math.floor(media.winStart + (n2 === 1 ? Math.min(5, usable) : (usable * i) / (n2 - 1)));
        return { title: `Clip ${i + 1}`, hook: '', hooks: [], caption: '', hashtags: '', bestTime: '', ...heuristicScore(st), scored: true, estimated: true, startSec: st };
      });
    }
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
      ...heuristicScore(5 + i * gap),
      scored: true,
      estimated: true,
      startSec: 5 + i * gap,
    }));
  };
  // Fallback score from signals we have: speech density (energy), whether the
  // window opens on a hook-like line, and how close it is to the start.
  function heuristicScore(start) {
    const len = Number(clipLength) || 30;
    const segs = ctx.transcript?.segments || [];
    const inWin = segs.filter(s => s.start >= start && s.start < start + len);
    const words = inWin.reduce((n, s) => n + String(s.text).split(/\s+/).filter(Boolean).length, 0);
    const wps = words / len;
    const text = inWin.map(s => s.text).join(' ');
    const first = inWin.slice(0, 6).map(s => s.text).join(' ');
    let score = 58;
    if (segs.length) {
      score += Math.min(12, Math.round(wps * 4));
      if (/[?!]|\b(never|nobody|secret|why|how|stop|biggest|worst|best|\d+)\b/i.test(first)) score += 6;
      if (/!/.test(text)) score += 3;
      if (wps < 0.5) score -= 6;
    } else {
      score += 4; // music/action footage with no speech
    }
    score += Math.max(0, 4 - Math.floor((start - (media?.winStart || 0)) / 120));
    score = Math.max(35, Math.min(82, score));
    const reason = segs.length
      ? `Estimated score (AI scoring unavailable): ${wps.toFixed(1)} words/sec of speech${score >= 70 ? ' with a strong opening' : ''}.`
      : 'Estimated score: no speech detected, so this is based on clip position and length rather than dialogue.';
    return { score, reason, reasons: { hook: segs.length ? 'Estimated from opening line' : 'Visual-only opening', pacing: `${wps.toFixed(1)} words/sec`, emotion: 'Estimate, not AI-rated' } };
  }

  async function runOne(c, i) {
    const start = Number(c.startSec || 0);
    const len = Number(clipLength);
    let playUrl = SAMPLE_VIDEOS[i % SAMPLE_VIDEOS.length];
    let real = false;

    const rio = process.env.RENDERIO_API_KEY;
    if (rio) {
      try {
        const label = autoSubtitles !== false && c.scored !== false ? (c.hook || c.title || '') : '';
        let timedWords = autoSubtitles !== false ? wordsInWindow(ctx.transcript, start, len) : [];
        // Track the speaker for vertical clips while there's time left in the 300s budget.
        let crop = null;
        // Skip face tracking when the monthly RenderIO budget is getting tight.
        let src = ctx.srcP ? await ctx.srcP : { url: rioUrl, direct: false };
        // HLS stream sources: a per-clip playlist with just the needed segments.
        const hls = !!(media && !media.mp4);
        let win;
        if (ctx.local) {
          // Small pre-trimmed segment (starts at the clip start) instead of the full source.
          // Lossless stream-copy segment; `offset` is where the clip really starts inside it
          // (the cut snaps back to a keyframe), so RenderIO seeks there frame-accurately.
          const seg = await segmentToBlob(ctx.local, ctx.dir, start, len, `${i}`);
          win = { url: seg.url, offset: seg.offset };
          src = { ...src, direct: true };
          // YouTube captions only carry phrase (or approximate) timings. Re-time this clip's
          // words with Whisper on the clip's own exact-start audio so captions land on the word.
          if (timedWords.length && ctx.transcript?.src !== 'whisper' && process.env.GROQ_API_KEY && len <= 900 && (ctx.retimeSec || 0) + len <= Number(process.env.RETIME_RUN_MAX_SEC || 1800)
            && Date.now() - (ctx.startedAt || Date.now()) < 200000 && await reserveAudioSec(len).catch(() => false)) {
            ctx.retimeSec = (ctx.retimeSec || 0) + len;
            try {
              const tr = await transcribeBuffer(await clipAudio(ctx.local, ctx.dir, start, len, `${i}`));
              const ww = (tr.segments || []).filter(w => w.start < len).map(w => ({ w: w.text, a: Math.max(0, w.start), b: Math.min(len, Math.max(w.end, w.start + 0.05)) }));
              if (ww.length >= Math.max(3, timedWords.length * 0.5)) { timedWords = ww; c._retimed = true; }
              else await releaseAudioSec(len).catch(() => {});
            } catch (e) { console.warn('clip retime failed', e?.message); await releaseAudioSec(len).catch(() => {}); }
          }
        } else {
          win = hls ? await windowPlaylist(media.videoUrl, start, len, rio) : { url: src.url, offset: start };
        }
        const long = len > 90;
        if (!long && vertical && Date.now() - (ctx.startedAt || Date.now()) < 170000 && (await renderioLeft()) > count + 10) crop = await faceCropFor(win.url, win.offset, len, src.direct ? 30000 : 45000, src.direct, hls);
        playUrl = await renderioCut(win.url, win.offset, len, rio, label, vertical, { wordCaptions: true, timedWords, style: pack || aiStyle, pack, crop: crop || safeClientCrop, brand, direct: src.direct, watermark, hls, long, ...(long ? { timeoutMs: Math.max(60000, 262000 - (Date.now() - (ctx.startedAt || Date.now()))) } : {}) });
        c._crop = crop || safeClientCrop || null;
        c._words = timedWords;
        real = true;
      } catch (e) {
        ctx.downloadError = e?.message || String(e);
        if (e?.capacity) ctx.capacity = true;
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
      duration: `${ctx.sourceSec && ctx.sourceSec < len ? Math.max(1, Math.floor(ctx.sourceSec)) : len}s`,
      format: clipFormat,
      style: pack || aiStyle,
      caption: autoSubtitles ? (c.caption || '') : '',
      socialCaption: c.caption || '',
      hashtags: c.hashtags || '',
      bestTime: c.bestTime || '',
      aiPrompt: c.reason || c.hook || '',
      reason: c.reason || c.hook || '',
      reasons: c.reasons || null,
      pack: pack || null,
      videoUrl: playUrl,
      source: videoUrl,
      startSec: start,
      endSec: start + len,
      // Kept so the caption editor can re-render this clip with the same timing/crop.
      words: (c._words || []).slice(0, 1500).map(w => ({ w: w.w, a: Math.round(w.a * 100) / 100, b: Math.round(w.b * 100) / 100 })),
      crop: c._crop || null,
      preview: !real,
    };
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const meter = newMeter();
      const t0 = Date.now();
      const writer = jobId ? jobWriter(jobId) : null;
      let open = true;
      const enqueue = (obj) => {
        if (!open) return;
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n')); } catch { open = false; }
      };
      const close = () => { if (!open) return; open = false; try { controller.close(); } catch {} };
      enqueue({ type: 'job', id: jobId });
      let watchdog = null;
      let handedOff = false;
      // Resolved when the watchdog ends the run, so waitUntil stops waiting on stuck RenderIO
      // calls and the invocation ends before Vercel's hard 300s kill.
      let stopRun = () => {};
      const stopP = new Promise(r => { stopRun = r; });
      // Continue this same job in a fresh invocation (fresh 300s budget). See local prep.
      const handOff = async () => {
        handedOff = true;
        if (watchdog) clearTimeout(watchdog);
        if (hb) clearInterval(hb);
        if (writer) await writer.flush();
        await touchJob(jobId, {});
        try { if (ctx.dir) await fs.rm(ctx.dir, { recursive: true, force: true }); } catch {}
        const headers = { 'Content-Type': 'application/json', 'x-continue-job': jobId, 'x-continue-sig': continueSig(jobId) };
        try { const t = await getVercelOidcToken(); if (t) headers['x-vercel-trusted-oidc-idp-token'] = t; } catch {}
        let ok = false;
        try {
          const res = await fetch(`${new URL(request.url).origin}/api/generate`, { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store' });
          ok = res.ok;
          console.log('handoff', { status: res.status, ms: Date.now() - t0 });
          res.body?.cancel().catch(() => {});
        } catch (e) { console.warn('handoff failed', e?.message); }
        if (!ok) {
          handedOff = false;
          await refundUsage();
          send({ type: 'error', message: 'This video took too long to process. Try again, or upload the file instead. This run was not counted.' });
          send({ type: 'done', total: 0, real: 0, preview: 0, failed: count, refunded: true, reason: 'handoff failed' });
        }
        close();
      };
      const hb = jobId ? setInterval(() => { touchJob(jobId); }, 10000) : null;
      const work = withMeter(meter, async () => {
      let finished = false;
      let clipsSent = 0;
      const send = (obj) => {
        if (finished) return;
        if (obj.type === 'done') finished = true;
        if (obj.type === 'clip') clipsSent += 1;
        writer?.push(obj);
        enqueue(obj);
      };
      // Watchdog: if the run would outlive the function, end it cleanly (refund + clear message)
      // instead of being killed and showing up as a lost run.
      watchdog = setTimeout(async () => {
        if (finished) return;
        if (clipsSent > 0) {
          send({ type: 'done', note: 'Some clips ran out of time.', total: clipsSent, real: clipsSent, preview: 0, failed: count - clipsSent });
          if (writer) { await writer.flush(); await touchJob(jobId, { done: true }); }
          close();
          stopRun();
          return;
        }
        await refundUsage().catch(() => {});
        reportError('generate:timeout', 'run exceeded time budget', videoUrl).catch(() => {});
        const msg = 'This video took too long to process. Try a shorter video, fewer clips, or upload the file. This run was not counted.';
        send({ type: 'error', message: msg });
        send({ type: 'done', total: 0, real: 0, preview: 0, failed: count, refunded: true, reason: 'too long' });
        if (writer) { await writer.flush(); await touchJob(jobId, { done: true }); }
        close();
        stopRun();
      }, Math.max(10000, RUN_BUDGET_MS - (Date.now() - reqStart)));
      try {
      const key = cacheKey(videoUrl, [clipFormat, aiStyle, Number(clipLength), autoSubtitles !== false, !!aiHook, brand, pack, 'v3', watermark ? 'wm' : 'clean', media?.live ? 'live' + media.liveMinutes : '']);
      const hit = media?.live || noCache ? null : await getCached(key);
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
        close();
        return;
      }
      // Tell the client right away that work has started; setup happens below.
      const startedAt = Date.now();
      ctx.startedAt = startedAt;
      send({ type: 'start', total: count, ...(media ? { stream: { live: !!media.live, minutes: media.liveMinutes || null, duration: Math.round(media.winLen), chunks: audioChunks } } : {}) });
      send({ type: 'status', step: 'transcript' });
      ctx.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-')).catch(() => null);
      const cachedTr = media?.live || noCache ? null : await getCachedTranscript(videoUrl).catch(() => null);
      if (!cachedTr && ytId && !media && subtitlesEnabled) ctx.subsP = fetchYoutubeSubtitles(videoUrl, 60000);
      // Cold run: start the RenderIO audio -> Whisper path at the same time as the
      // YouTube caption fetch (captions are usually blocked from Vercel). If captions
      // win, the audio result is simply ignored.
      // Download the source once (720p) right away; audio, face frames and cuts then run
      // as plain ffmpeg jobs on that file (fast seeks) instead of each re-downloading it.
      // Uploads are already direct files. If the download fails, fall back to per-job yt-dlp.
      const rioKey = process.env.RENDERIO_API_KEY;
      if (rioKey && media) {
        ctx.srcP = Promise.resolve({ url: media.videoUrl, direct: true });
      } else if (rioKey) {
        // A previous invocation of this job (or a recent run) may already have the source in Blob.
        ctx.cachedSrc = ytId && youtubeDownloader() ? await kvGetJson(SRC_KEY(ytId)) : null;
        ctx.srcP = isBlobUrl(videoUrl)
          ? Promise.resolve({ url: rioUrl, direct: true })
          : ctx.cachedSrc?.blob
            ? Promise.resolve({ url: ctx.cachedSrc.blob, direct: true, blob: true })
          : (ytId && youtubeDownloader()
              ? youtubeDownloader()(videoUrl, 150000, { format: ytSourceFormat(ytSecs) })
              : renderioRun({ input_urls: { in_video: videoUrl }, format_selector: '720p' }, 'out_video', rioKey, 120000)
                  // Some sites (e.g. Facebook reels/shares) have no format matching '720p': retry with yt-dlp's default pick.
                  .catch((e) => { if (e?.capacity) throw e; console.warn('720p download failed, retrying default format', e?.message); return renderioRun({ input_urls: { in_video: videoUrl } }, 'out_video', rioKey, 120000); }))
              .then(u => ({ url: u, direct: true }))
              .catch((e) => { console.warn('source download failed', e?.message); if (e?.capacity) ctx.capacity = true; ctx.srcFailed = e?.message || 'download failed'; return { url: rioUrl, direct: false }; });
        // Fail fast: if the link can't be downloaded, every per-clip yt-dlp fallback hangs
        // the same way, so stop now, refund the run and tell the user clearly.
        if (!isBlobUrl(videoUrl)) {
          await ctx.srcP;
          if (ctx.srcFailed) {
            try { if (ctx.dir) await fs.rm(ctx.dir, { recursive: true, force: true }); } catch {}
            await refundUsage();
            await reportError('generate:download', ctx.capacity ? 'at RenderIO capacity' : 'source download failed: ' + ctx.srcFailed, videoUrl).catch(() => {});
            const why = ytId
              ? 'YouTube downloads are temporarily down on our side (YouTube is blocking our video downloader)'
              : 'We couldn\u2019t download that video link right now';
            const msg = ytId
              ? `${why}. This isn\u2019t because you left the page. Please upload the video file instead (tap Upload), which works normally. This run was not counted.`
              : `${why}. Try uploading the video file instead, or try again later. This run was not counted.`;
            send({ type: 'error', message: ctx.capacity ? CAPACITY_MESSAGE : msg });
            send({ type: 'done', total: 0, real: 0, preview: 0, failed: count, refunded: true, reason: why });
            close();
            return;
          }
          // YouTube via the download API: pull the file into /tmp once and do audio + per-clip
          // segments locally, so RenderIO never has to fetch the whole (possibly huge) source.
          // Without a local ffmpeg binary, skip local prep and let RenderIO's ffmpeg fetch the source.
          if (ytId && youtubeDownloader() && ctx.dir && !localFfmpegAvailable()) console.error('[ffmpeg] local binary missing; using RenderIO for this run');
          if (ytId && youtubeDownloader() && ctx.dir && localFfmpegAvailable()) {
            const src = await ctx.srcP;
            const file = path.join(ctx.dir, 'src.mp4');
            const t0 = Date.now();
            try {
              const left = Math.max(30000, RUN_BUDGET_MS - 40000 - (Date.now() - startedAt));
              const res = src.blob
                ? await downloadToFile(src.url, file, left, { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` })
                : await downloadToFile(src.url, file, left, {}, cont ? null : `sources/${ytId}.mp4`);
              if (res.blobUrl) kvSetJson(SRC_KEY(ytId), { blob: res.blobUrl }, 30 * 24 * 3600).catch(() => {});
              ctx.sourceSec = await probeDuration(file);
              console.log('local source', { ms: Date.now() - t0, bytes: res.size, sec: ctx.sourceSec, fromBlob: !!src.blob });
              ctx.local = file;
              // Not enough time left in this invocation for transcription + cuts: hand the job to a
              // fresh invocation, which picks the source up from Blob and continues the same job.
              if (!cont && res.blobUrl && Date.now() - startedAt > HANDOFF_AFTER_MS) {
                await handOff();
                return;
              }
            } catch (e) {
              console.warn('local source download failed', e?.message);
              if (src.blob) kvSetJson(SRC_KEY(ytId), {}, 1).catch(() => {});
            }
            if (!ctx.local) {
              try { await fs.rm(ctx.dir, { recursive: true, force: true }); } catch {}
              await refundUsage();
              send({ type: 'error', message: 'This video took too long to download. Try again in a minute, or upload the file instead. This run was not counted.' });
              send({ type: 'done', total: 0, real: 0, preview: 0, failed: count, refunded: true, reason: 'download slow' });
              close();
              return;
            }
            if (ctx.sourceSec && ctx.sourceSec > YT_MAX_SECONDS) {
              try { await fs.rm(ctx.dir, { recursive: true, force: true }); } catch {}
              await refundUsage();
              send({ type: 'error', message: YT_TOO_LONG });
              send({ type: 'done', total: 0, real: 0, preview: 0, failed: count, refunded: true, reason: 'too long' });
              close();
              return;
            }
          }
        }
      }
      let audioP = null;
      if (media && !cachedTr && rioKey && process.env.GROQ_API_KEY) {
        // Split the window into <=60 min chunks, transcribe them in parallel, merge in source time.
        const n = Math.max(1, Math.ceil(media.winLen / STREAM_CHUNK_SEC));
        const step = media.winLen / n;
        ctx.chunks = Array.from({ length: n }, (_, k) => ({ start: media.winStart + k * step, len: step }));
        audioP = Promise.all(ctx.chunks.map(ch => streamChunkTranscript(media.audioUrl, ch.start, ch.len, 150000, !!media.mp4)
          .catch((e) => { console.warn('stream chunk failed', ch.start, e?.message); if (e?.capacity) ctx.capacity = true; return EMPTY_TRANSCRIPT; })))
          .then(parts => {
            ctx.chunkTranscripts = parts;
            const segments = parts.flatMap(p => p.segments);
            return { text: segments.map(x => x.text).join(' '), segments };
          });
      } else if (!cachedTr && ctx.local) {
        // YouTube captions (RapidAPI) first; Groq Whisper (hourly quota) then Gemini as fallbacks.
        audioP = (ctx.subsP || Promise.resolve(EMPTY_TRANSCRIPT)).then(sub => sub?.segments?.length
          ? sub
          : localTranscript(ctx.local, ctx.dir, process.env.GROQ_API_KEY ? transcribeBuffer : async () => EMPTY_TRANSCRIPT, {
              maxSec: Number(process.env.GROQ_RUN_MAX_SEC || 2400), reserve: reserveAudioSec, release: releaseAudioSec, fallback: geminiTranscribe,
            })).catch((e) => { console.warn('local transcript failed', e?.message); return EMPTY_TRANSCRIPT; });
      } else if (!cachedTr && ctx.srcP && process.env.GROQ_API_KEY) {
        audioP = ctx.srcP.then(src => audioTranscript(src.url, 120000, src.direct)).catch((e) => { console.warn('audio transcript failed', e?.message); return EMPTY_TRANSCRIPT; });
      }
      // Whisper gives true per-word timings (captions pop on the spoken word); YouTube
      // captions only give phrase timings. Prefer Whisper whenever the audio job runs.
      if (audioP) {
        send({ type: 'status', step: 'transcript', detail: 'audio' });
        const [w, yt] = await Promise.all([audioP, ytId && !media ? fetchTranscript(videoUrl) : EMPTY_TRANSCRIPT]);
        ctx.transcript = w?.segments?.length ? w : yt;
        ctx.transcriptSource = w?.segments?.length ? 'whisper' : yt?.segments?.length ? 'youtube' : null;
      } else {
        ctx.transcript = cachedTr || (ytId ? await fetchTranscript(videoUrl) : EMPTY_TRANSCRIPT);
        ctx.transcriptSource = cachedTr ? 'cache' : ctx.transcript?.segments?.length ? 'youtube' : null;
      }
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
            const ffmpeg = ffmpegPath();
            if (ffmpeg) {
              try {
                await exec(ffmpeg, ['-y', '-i', ctx.source, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', audio]);
                ctx.transcript = await transcribe(audio);
              } catch {}
            }
          }
        }
      } catch {}

      // Last-chance transcript before falling back to heuristic scores: retry the
      // YouTube captions once more, then one fresh audio->Whisper pass if time allows.
      if (!ctx.transcript?.segments?.length && ytId) {
        const again = await fetchTranscript(videoUrl, 1);
        if (again.segments.length) { ctx.transcript = again; ctx.transcriptSource = 'youtube'; }
      }
      if (!ctx.transcript?.segments?.length && ctx.srcP && !ctx.local && process.env.GROQ_API_KEY && Date.now() - startedAt < 120000) {
        send({ type: 'status', step: 'transcript', detail: 'audio-retry' });
        const src = await ctx.srcP;
        const w = await audioTranscript(src.url, 90000, src.direct).catch((e) => { console.warn('audio transcript retry failed', e?.message); return EMPTY_TRANSCRIPT; });
        if (w?.segments?.length) { ctx.transcript = w; ctx.transcriptSource = 'whisper'; }
      }
      if (!cachedTr && ctx.transcript?.segments?.length) setCachedTranscript(videoUrl, ctx.transcript).catch(() => {});
      // YouTube length cap when the upfront lookup was blocked: the transcript tells us the length.
      const segsAll = ctx.transcript?.segments || [];
      const lenSec = segsAll.length ? segsAll[segsAll.length - 1].end : 0;
      if (ytId && lenSec > YT_MAX_SECONDS) {
        await refundUsage();
        send({ type: 'error', message: YT_TOO_LONG });
        send({ type: 'done', total: 0, real: 0, preview: 0, failed: count, refunded: true, reason: 'too long' });
        close();
        return;
      }
      send({ type: 'status', step: 'scoring', hasTranscript: !!ctx.transcript?.text });
      let scored = null;
      // Long non-stream transcripts (e.g. 45 min+ YouTube) are scored in 20-min windows too,
      // so the prompt isn't truncated to the opening and clips come from across the video.
      const segsT = ctx.transcript?.segments || [];
      if (!media && segsT.length && segsT[segsT.length - 1].end - segsT[0].start > 25 * 60) {
        const W = 20 * 60;
        const groups = new Map();
        for (const sg of segsT) { const g = Math.floor(sg.start / W); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(sg); }
        ctx.chunkTranscripts = [...groups.values()].map(sgs => ({ text: sgs.map(x => x.text).join(' '), segments: sgs }));
      }
      if ((media || (ctx.chunkTranscripts && ctx.chunkTranscripts.length > 1)) && ctx.transcript?.segments?.length) {
        // Score each chunk on its own (keeps prompts small and parallel), then keep the best
        // non-overlapping moments across the whole stream.
        const winStartS = media ? media.winStart : 0;
        const winEnd = media ? media.winStart + media.winLen : (ctx.sourceSec || segsT[segsT.length - 1].end);
        const parts = (ctx.chunkTranscripts && ctx.chunkTranscripts.length > 1) ? ctx.chunkTranscripts : [ctx.transcript];
        const scoreChunk = async (tr) => {
          if (!tr?.segments?.length) return [];
          let r = await scoreWithGemini(tr, videoUrl, clipFormat, aiStyle, clipLength, count);
          if (!r && Date.now() - startedAt < 170000) r = await scoreWithGemini(tr, videoUrl, clipFormat, aiStyle, clipLength, count);
          const lo = tr.segments[0].start, hi = tr.segments[tr.segments.length - 1].end;
          return (r?.clips || []).filter(c => c.startSec >= lo - 5 && c.startSec <= hi);
        };
        const all = (await Promise.all(parts.map(scoreChunk))).flat()
          .map(c => ({ ...c, startSec: Math.max(winStartS, Math.min(Number(c.startSec) || 0, winEnd - clipLength)) }))
          .sort((a, b) => (b.score || 0) - (a.score || 0));
        const picked = [];
        for (const c of all) {
          if (picked.length >= count) break;
          if (picked.every(p => Math.abs(p.startSec - c.startSec) >= clipLength)) picked.push(c);
        }
        scored = picked.length ? { clips: picked } : null;
      } else {
        scored = ctx.transcript?.text ? await scoreWithGemini(ctx.transcript, videoUrl, clipFormat, aiStyle, clipLength, count) : null;
        if (!scored && ctx.transcript?.text && Date.now() - startedAt < 170000) {
          scored = await scoreWithGemini(ctx.transcript, videoUrl, clipFormat, aiStyle, clipLength, count); // one retry
        }
      }
      // Only a real scoring failure is alert-worthy; no transcript is an expected fallback (log only).
      if (!scored?.clips?.length) {
        if (ctx.transcript?.text) reportError('generate:score', new Error('Gemini scoring failed twice; used heuristic scores'), videoUrl).catch(() => {});
        else console.warn('generate: no transcript; used heuristic scores', videoUrl);
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
      if (clips.length && !media?.live) await setCached(key, clips);
      try { if (ctx.dir) await fs.rm(ctx.dir, { recursive: true, force: true }); } catch {}
      const real = clips.length;
      if (!real) {
        await refundUsage();
        await reportError('generate', ctx.capacity ? 'at RenderIO capacity' : (ctx.downloadError || 'no clips produced'), videoUrl);
        const why = ctx.downloadError || 'Video processing is unavailable right now.';
        send({ type: 'error', message: ctx.capacity ? CAPACITY_MESSAGE : `No clips could be made from that video (${String(why).slice(0, 200)}). This run was not counted.` });
        send({ type: 'done', total: 0, real: 0, preview: 0, failed: base.length, refunded: true, reason: why });
        close();
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
      close();
      } catch (e) {
        console.error('generate stream failed', e);
        await reportError('generate', e, videoUrl);
        await refundUsage().catch(() => {});
        send({ type: 'error', message: e?.message || 'generate failed' });
        send({ type: 'done', note: 'Stopped early.', total: 0 });
        close();
      }
      }).finally(async () => {
        if (hb) clearInterval(hb);
        clearTimeout(watchdog);
        if (writer && !handedOff) { await writer.flush(); await touchJob(jobId, { done: true }); }
        close();
      }).finally(() => saveRun({
        at: t0, ms: Date.now() - t0, video: youtubeId(videoUrl) || String(videoUrl).slice(0, 120),
        requested: count, clipLength, tier, cached: !!ctx.cachedHit,
        transcript: ctx.transcriptSource || null,
        clips: (ctx.runClips || []).map(c => ({ score: c.viralScore || 0, scored: c.scored !== false })),
        failed: ctx.runFailed || 0,
        meter,
      }));
      // Keep the function alive until the job finishes even if the client disconnects.
      try { waitUntil(Promise.race([work, stopP])); } catch {}
      return undefined;
    },
    cancel() { /* client went away; the job keeps running and stays resumable */ },
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
    await reportError('generate', e);
    return NextResponse.json({ success: false, message: e?.message || 'generate failed' }, { status: 500 });
  }
}
