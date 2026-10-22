import { NextResponse } from 'next/server';

// Real AI generation scaffold.
// Replace the simulated response with a call to your preferred video API
// (e.g. AssemblyAI, Deepgram, or a custom clipping service).
export async function POST(request) {
  const body = await request.json();
  const { videoUrl, clipFormat = 'shorts_9_16', aiStyle = 'character_swap', autoSubtitles, aiHook } = body;

  if (!videoUrl) {
    return NextResponse.json({ success: false, message: 'Missing videoUrl' }, { status: 400 });
  }

  // TODO: Call real video analysis / clipping service here.
  // Example structure for future integration:
  // const analysis = await fetch('https://api.example.com/analyze', { ... });

  const clips = [
    {
      id: `c_${Date.now()}_1`,
      title: 'The moment everyone missed',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      hook: aiHook ? 'Wait for the last 3 seconds…' : '',
      score: 94,
      duration: '0:18',
      format: clipFormat,
      style: aiStyle,
      caption: autoSubtitles ? 'This changed everything.' : '',
      source: videoUrl,
    },
    {
      id: `c_${Date.now()}_2`,
      title: 'Unexpected reaction',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      hook: aiHook ? 'I didn’t expect that' : '',
      score: 87,
      duration: '0:12',
      format: clipFormat,
      style: aiStyle,
      caption: autoSubtitles ? 'The algorithm is going to love this.' : '',
      source: videoUrl,
    },
    {
      id: `c_${Date.now()}_3`,
      title: 'Quick tip that hits',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
      hook: aiHook ? 'Do this next time' : '',
      score: 81,
      duration: '0:15',
      format: clipFormat,
      style: aiStyle,
      caption: autoSubtitles ? 'Save this for later.' : '',
      source: videoUrl,
    },
  ];

  return NextResponse.json({
    success: true,
    data: { clips, source: videoUrl, simulated: true }
  });
}
