export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

const TOOLS = {
  hooks: 'Generate 8 short viral hooks (under 12 words) for TikTok/Reels/Shorts. Return a JSON array of strings only.',
  captions: 'Write 3 ready-to-post captions with hashtags and a CTA. Return JSON: {"captions":[{"text":"...","hashtags":"#a #b #c","cta":"..."}]}',
  script: 'Write a 30-second spoken script for a short video. Return JSON: {"script":"...","beats":["0-3s hook","3-20s value","20-30s CTA"]}',
  ideas: 'Generate 10 content ideas with a hook and why it could go viral. Return JSON: {"ideas":[{"title":"...","hook":"...","why":"..."}]}',
  titles: 'Generate 10 punchy titles under 60 characters. Return a JSON array of strings only.',
  rewrite: 'Rewrite the text to be sharper, more spoken, and more viral. Return JSON: {"versions":["...","...","..."]}',
  cta: 'Write 6 strong CTAs for the end of a short. Return a JSON array of strings only.',
  thumbnails: 'Write 5 image prompts for a high-click YouTube/TikTok thumbnail. Return JSON: {"prompts":["..."]}',
};

export async function POST(request) {
  const { tool, input } = await request.json().catch(() => ({}));
  const instruction = TOOLS[tool];
  if (!instruction || !String(input || '').trim()) {
    return NextResponse.json({ success: false, message: 'Missing tool or input' }, { status: 400 });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ success: false, message: 'AI key missing' }, { status: 500 });

  const prompt = `${instruction}\n\nTopic or text:\n${String(input).slice(0, 4000)}`;
  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
      }),
    });
    if (!res.ok) { const err = await res.text(); return NextResponse.json({ success: false, message: 'AI request failed', detail: err.slice(0, 400) }, { status: 502 }); }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    let result = match ? JSON.parse(match[0]) : { text };
    return NextResponse.json({ success: true, tool, result });
  } catch (e) {
    return NextResponse.json({ success: false, message: e?.message || 'AI failed' }, { status: 500 });
  }
}
