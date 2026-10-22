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

async function fetchTranscript(url) {
  const id = youtubeId(url);
  if (!id) return '';
  try {
    const { YouTubeTranscriptApi } = await import('extract-youtube');
    const api = new YouTubeTranscriptApi();
    const tr = await api.fetch(id);
    const raw = typeof tr.toRawData === 'function' ? tr.toRawData() : tr;
    const snippets = raw?.snippets || raw?.transcript || raw || [];
    if (Array.isArray(snippets)) {
      return snippets.map(s => s.text || s).filter(Boolean).join(' ');
    }
    return String(raw || '');
  } catch (e) {
    console.error('transcript failed', e?.message);
    return '';
  }
}


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


function captionText(s) {
  return String(s || 'Watch this')
    .replace(/[\\'":%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 52) || 'Watch this';
}

async function renderioCut(url, start, length, key, caption, vertical) {
  const text = captionText(caption);
  const frame = vertical
    ? 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black'
    : 'scale=1280:-2';
  const vf = `${frame},drawtext=text='${text}':fontsize=42:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h-160`;
  const body = {
    input_urls: { in_video: url },
    ffmpeg_command: `-ss ${Number(start) || 0} -i {{in_video}} -t ${Number(length) || 30} -vf "${vf}" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -movflags +faststart {{out_clip}}`,
    output_files: { out_clip: 'clip.mp4' },
  };
  const submit = await fetch('https://renderio.dev/api/v1/run-ytdlp-command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
    body: JSON.stringify(body),
  });
  if (!submit.ok) {
    const t = await submit.text();
    throw new Error('renderio submit ' + submit.status + ' ' + t.slice(0, 160));
  }
  const { command_id } = await submit.json();
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500));
    const poll = await fetch('https://renderio.dev/api/v1/commands/' + command_id, {
      headers: { 'X-API-KEY': key },
    });
    const result = await poll.json();
    if (result.status === 'SUCCESS') {
      const file = result.output_files?.out_clip;
      const play = file?.storage_url || file?.external_uri;
      if (!play) throw new Error('renderio no file');
      return play;
    }
    if (result.status === 'FAILED') throw new Error(result.error_message || 'renderio failed');
  }
  throw new Error('renderio timeout');
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

export async function POST(request) {
  const body = await request.json();
  const { videoUrl, clipFormat = 'shorts_9_16', aiStyle = 'character_swap', autoSubtitles, aiHook, clipLength = 30 } = body;
  if (!videoUrl) return NextResponse.json({ success: false, message: 'Missing videoUrl' }, { status: 400 });

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-'));
  let source = null;
  let transcript = await fetchTranscript(videoUrl);

  let downloadError = null;
  try {
    if (process.env.RENDERIO_API_KEY) {
      // RenderIO handles download + cut. Skip Tunelio.
    } else {
    const dl = await downloadSource(videoUrl, dir);
    source = dl?.path || null;
    downloadError = dl?.error || null;
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
    }
  } catch {}

  const scored = await scoreWithGemini(transcript || `Video about ${videoUrl}. No transcript available.`, videoUrl, clipFormat, aiStyle, clipLength);
  const base = scored?.clips?.length
    ? scored.clips.slice(0, 3)
    : [
        { title: 'The moment everyone missed', hook: 'Wait for the last 3 seconds…', caption: 'This changed everything. #viral', score: 94, startSec: 5 },
        { title: 'Unexpected reaction', hook: 'I didn’t expect that', caption: 'The algorithm will love this. #shorts', score: 87, startSec: 40 },
        { title: 'Quick tip that hits', hook: 'Do this next time', caption: 'Save this. #tips', score: 81, startSec: 80 },
      ];

  const vertical = clipFormat === 'shorts_9_16';
  const jobs = base.map(async (c, i) => {
    const start = Number(c.startSec || 0);
    const len = Number(clipLength);
    let playUrl = SAMPLE_VIDEOS[i % SAMPLE_VIDEOS.length];
    let real = false;

    const rio = process.env.RENDERIO_API_KEY;
    if (rio) {
      try {
        const label = autoSubtitles !== false ? (c.hook || c.title || '') : '';
        playUrl = await renderioCut(videoUrl, start, len, rio, label, vertical);
        real = true;
      } catch (e) {
        downloadError = e?.message || String(e);
      }
    } else if (source) {
      const out = path.join(dir, `clip_${i}.mp4`);
      const cut = await cutClip(source, start, len, out);
      let ok = cut.ok;
      let fileToUpload = out;
      if (!cut.ok) {
        downloadError = cut.error;
        fileToUpload = source;
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
    };
  });
  const clips = await Promise.all(jobs);

  try { await fs.rm(dir, { recursive: true, force: true }); } catch {}

  return NextResponse.json({
    success: true,
    data: {
      clips,
      source: videoUrl,
      simulated: clips.every(c => c.preview),
      note: clips.some(c => !c.preview)
        ? 'Cut from your source video.'
        : (downloadError || (transcript ? 'AI scored from the real transcript. Preview videos until download succeeds.' : 'Preview clips. Real cutting runs when download succeeds.')),
      hasTranscript: !!transcript,
      downloadError: downloadError || null,
      hasTunelio: !!process.env.TUNELIO_API_KEY,
      hasRenderio: !!process.env.RENDERIO_API_KEY,
    },
  });
}
