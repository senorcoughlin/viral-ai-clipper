export const maxDuration = 300; // Vercel Pro
import { NextResponse } from 'next/server';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SAMPLE_VIDEOS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4',
  'https://filesamples.com/samples/video/mp4/sample_640x360.mp4',
];

function videoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/(shorts|embed)\/([^/?]+)/);
    if (m) return m[2];
  } catch {}
  return url.slice(-11);
}

async function scoreWithGemini(videoUrl, format, style, length = 30) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const id = videoId(videoUrl);

  const prompt = `You are a viral short-form editor. Invent 3 distinct 15-40s clip ideas for this video that would perform on TikTok/Reels/Shorts. Make them specific and different from each other. Use the video id as flavor so they feel unique.

Return ONLY valid JSON:
{"clips":[{"title":"...","hook":"...","caption":"... #tag #tag","score":90,"startSec":10,"endSec":28,"reason":"..."}]}

Video: ${videoUrl}
Video id: ${id}
Format: ${format}
Style: ${style}
Target length: ${length} seconds. Each clip should be about this long.`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function POST(request) {
  const body = await request.json();
  const { videoUrl, clipFormat = 'shorts_9_16', aiStyle = 'character_swap', autoSubtitles, aiHook, clipLength = 30 } = body;
  if (!videoUrl) return NextResponse.json({ success: false, message: 'Missing videoUrl' }, { status: 400 });

  const scored = await scoreWithGemini(videoUrl, clipFormat, aiStyle, clipLength);
  const base = scored?.clips?.length
    ? scored.clips.slice(0, 3)
    : [
        { title: 'The moment everyone missed', hook: 'Wait for the last 3 seconds…', caption: 'This changed everything. #viral #clips', score: 94, startSec: 10, endSec: 28, reason: 'Strong hook' },
        { title: 'Unexpected reaction', hook: 'I didn’t expect that', caption: 'The algorithm is going to love this. #shorts #fyp', score: 87, startSec: 40, endSec: 52, reason: 'Surprise beat' },
        { title: 'Quick tip that hits', hook: 'Do this next time', caption: 'Save this for later. #tips #creator', score: 81, startSec: 70, endSec: 85, reason: 'Actionable' },
      ];

  const clips = base.map((c, i) => ({
    id: `c_${Date.now()}_${i + 1}`,
    title: c.title,
    hook: aiHook ? (c.hook || '') : '',
    score: c.score || 80,
    viralScore: c.score || 80,
    duration: `${clipLength}s`,
    format: clipFormat,
    style: aiStyle,
    caption: autoSubtitles ? (c.caption || '') : '',
    socialCaption: c.caption || '',
    aiPrompt: c.reason || c.hook || '',
    videoUrl: SAMPLE_VIDEOS[i % SAMPLE_VIDEOS.length],
    source: videoUrl,
    startSec: c.startSec,
    endSec: c.startSec ? c.startSec + Number(clipLength) : Number(clipLength),
    preview: true,
  }));

  return NextResponse.json({
    success: true,
    data: {
      clips,
      source: videoUrl,
      simulated: !scored,
      note: scored
        ? 'AI-scored. Playback uses preview clips until real cutting is enabled.'
        : 'Preview mode. Add a valid Gemini key for AI titles.',
    },
  });
}
