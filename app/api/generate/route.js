import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const videoUrl = body.videoUrl;

    if (!videoUrl) {
      return NextResponse.json({ success: false, message: 'URL required' }, { status: 400 });
    }

    const clips = [
      {
        id: Date.now(),
        title: 'Viral Highlight 1',
        timestamp: '00:12 - 00:38',
        format: body.clipFormat || 'shorts_9_16',
        subtitlesEnabled: true,
        hookEnabled: true,
        viralScore: 98,
        socialCaption: 'Wait until the end! 🔥 #shorts',
        aiPrompt: 'High quality 4k render, perfect tracking.'
      }
    ];

    return NextResponse.json({
      success: true,
      data: {
        sourceUrl: videoUrl,
        generatedClips: clips
      }
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
