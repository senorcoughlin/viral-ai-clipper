import { NextResponse } from 'next/server';

export async function POST(req) {
  const body = await req.json();
  return NextResponse.json({
    success: true,
    data: {
      generatedClips: [
        {
          id: 1,
          title: 'Highlight Clip 1',
          timestamp: '00:12 - 00:38',
          format: body.clipFormat || 'shorts_9_16',
          viralScore: 98,
          socialCaption: 'Wait until the end! 🔥 #shorts',
          aiPrompt: 'High quality 4k render, perfect tracking.'
        }
      ]
    }
  });
}
