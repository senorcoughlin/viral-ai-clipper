import { NextResponse } from 'next/server';

export async function POST(request) {
  const body = await request.json();
  const { videoUrl, clipFormat = 'shorts_9_16', aiStyle = 'character_swap' } = body;

  // Simulated viral clips — replace with real pipeline later
  const clips = [
    {
      id: 'c1',
      title: 'The moment everyone missed',
      hook: 'Wait for the last 3 seconds…',
      score: 94,
      duration: '0:18',
      format: clipFormat,
      style: aiStyle,
      thumbnail: null,
      caption: 'This changed everything.',
    },
    {
      id: 'c2',
      title: 'Unexpected reaction',
      hook: 'I didn’t expect that',
      score: 87,
      duration: '0:12',
      format: clipFormat,
      style: aiStyle,
      thumbnail: null,
      caption: 'The algorithm is going to love this.',
    },
    {
      id: 'c3',
      title: 'Quick tip that hits',
      hook: 'Do this next time',
      score: 81,
      duration: '0:15',
      format: clipFormat,
      style: aiStyle,
      thumbnail: null,
      caption: 'Save this for later.',
    },
  ];

  return NextResponse.json({
    success: true,
    data: { clips, source: videoUrl }
  });
}
