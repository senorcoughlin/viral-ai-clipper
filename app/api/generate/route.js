export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const exec = promisify(execFile);
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

const SAMPLE_VIDEOS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4',
];

async function scoreWithGemini(transcript, videoUrl, format, style, length) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const prompt = `You are a viral short-form editor. From this transcript, pick the 3 best moments of about ${length} seconds for TikTok/Reels/Shorts.
Return ONLY valid JSON:
{"clips":[{"title":"...","hook":"...","caption":"... #tag","score":90,"startSec":10,"endSec":${10 + length},"reason":"..."}]}
Video: ${videoUrl}
Format: ${format}
Style: ${style}
Transcript:
${(transcript || '').slice(0, 14000)}`;
  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1200 },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

async function transcribe(audioPath) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return '';
  try {
    const buf = await fs.readFile(audioPath);
    const form = new FormData();
    form.append('file', new Blob([buf]), 'audio.mp3');
    form.append('model', 'whisper-large-v3');
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data.text || '';
  } catch {
    return '';
  }
}

async function downloadSource(url, dir) {
  try {
    const YTDlpWrap = (await import('yt-dlp-wrap')).default;
    const ytdlp = new YTDlpWrap();
    const out = path.join(dir, 'source.mp4');
    await ytdlp.execPromise([
      url,
      '-f', 'bv*[height<=720]+ba/b[height<=720]/b',
      '--merge-output-format', 'mp4',
      '-o', out,
      '--no-playlist',
      '--max-filesize', '80M',
    ]);
    return out;
  } catch (e) {
    console.error('download failed', e?.message);
    return null;
  }
}

async function cutClip(src, start, length, outPath) {
  const ffmpeg = require('ffmpeg-static');
  if (!ffmpeg) return false;
  try {
    await exec(ffmpeg, [
      '-y', '-ss', String(start), '-i', src, '-t', String(length),
      '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart',
      '-preset', 'veryfast', outPath,
    ]);
    return true;
  } catch (e) {
    console.error('cut failed', e?.message);
    return false;
  }
}

export async function POST(request) {
  const body = await request.json();
  const { videoUrl, clipFormat = 'shorts_9_16', aiStyle = 'character_swap', autoSubtitles, aiHook, clipLength = 30 } = body;
  if (!videoUrl) return NextResponse.json({ success: false, message: 'Missing videoUrl' }, { status: 400 });

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-'));
  let source = null;
  let transcript = '';

  try {
    source = await downloadSource(videoUrl, dir);
    if (source) {
      const audio = path.join(dir, 'audio.mp3');
      const ffmpeg = require('ffmpeg-static');
      if (ffmpeg) {
        try {
          await exec(ffmpeg, ['-y', '-i', source, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', audio]);
          transcript = await transcribe(audio);
        } catch {}
      }
    }
  } catch {}

  const scored = await scoreWithGemini(transcript || `Video about ${videoUrl}`, videoUrl, clipFormat, aiStyle, clipLength);
  const base = scored?.clips?.length
    ? scored.clips.slice(0, 3)
    : [
        { title: 'The moment everyone missed', hook: 'Wait for the last 3 seconds…', caption: 'This changed everything. #viral', score: 94, startSec: 5 },
        { title: 'Unexpected reaction', hook: 'I didn’t expect that', caption: 'The algorithm will love this. #shorts', score: 87, startSec: 40 },
        { title: 'Quick tip that hits', hook: 'Do this next time', caption: 'Save this. #tips', score: 81, startSec: 80 },
      ];

  const clips = [];
  for (let i = 0; i < base.length; i++) {
    const c = base[i];
    const start = Number(c.startSec || 0);
    const len = Number(clipLength);
    let playUrl = SAMPLE_VIDEOS[i % SAMPLE_VIDEOS.length];
    let real = false;

    if (source) {
      const out = path.join(dir, `clip_${i}.mp4`);
      const ok = await cutClip(source, start, len, out);
      if (ok && process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const buf = await fs.readFile(out);
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

    clips.push({
      id: `c_${Date.now()}_${i + 1}`,
      title: c.title,
      hook: aiHook ? (c.hook || '') : '',
      score: c.score || 80,
      viralScore: c.score || 80,
      duration: `${len}s`,
      format: clipFormat,
      style: aiStyle,
      caption: autoSubtitles ? (c.caption || '') : '',
      socialCaption: c.caption || '',
      aiPrompt: c.reason || c.hook || '',
      videoUrl: playUrl,
      source: videoUrl,
      startSec: start,
      endSec: start + len,
      preview: !real,
    });
  }

  try { await fs.rm(dir, { recursive: true, force: true }); } catch {}

  return NextResponse.json({
    success: true,
    data: {
      clips,
      source: videoUrl,
      simulated: clips.every(c => c.preview),
      note: clips.some(c => !c.preview)
        ? 'Cut from your source video.'
        : 'Preview clips. Real cutting runs when download succeeds.',
    },
  });
}
